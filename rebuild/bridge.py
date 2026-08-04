#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
VoidScript bridge (self-made, clean-room rebuild — Phase 1).

Role: a tiny local MCP *host*. It launches the MCP servers listed in
config.json (Roblox Studio's among them), speaks the standard Model Context
Protocol (JSON-RPC 2.0 over each server's stdio), and exposes their aggregated
tools to the browser extension over a WebSocket on 127.0.0.1:<PORT>.

This is an independent implementation built from the public MCP specification
and the documented Roblox Studio MCP behavior — not derived from the original
ZeroScript bridge. Extension-facing protocol is VoidScript's own (see
../REBUILD.md, "Extension <-> Bridge"):

    ext -> bridge : {"type":"hello",     "version": "..."}         -> ready
    ext -> bridge : {"type":"list_tools"}                          -> tools
    ext -> bridge : {"type":"call", "id":N, "tool":"..", "params":{}} -> result|error
    ext -> bridge : {"type":"ping"}                                -> pong
    bridge -> ext : {"type":"status", ...}   (broadcast on change)

Requires: Python 3.9+ and the `websockets` package (the launchers install it).
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

try:
    import websockets
except ImportError:  # pragma: no cover - the launchers install this for the user
    sys.stderr.write("The 'websockets' package is missing. Run start.bat / MacOS_Start.command.\n")
    raise SystemExit(1)

HERE = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("ZS_BRIDGE_PORT", "17613"))
CONFIG_PATH = Path(os.environ.get("VOID_CONFIG", HERE.parent / "config.json"))
MCP_PROTOCOL_VERSION = "2024-11-05"
CLIENT_INFO = {"name": "voidscript-bridge", "version": "2.0"}


# ── logging ────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    print(f"  {time.strftime('%H:%M:%S')}  {msg}", flush=True)


# ── one MCP server connection (JSON-RPC 2.0 over the process's stdio) ────────
class McpServer:
    """Manages a single stdio MCP server subprocess and its request/response
    correlation. MCP stdio framing is newline-delimited JSON-RPC 2.0."""

    def __init__(self, name: str, command: str, args: list[str], env: dict | None):
        self.name = name
        self.command = command
        self.args = args or []
        self.env = env or {}
        self.proc: asyncio.subprocess.Process | None = None
        self.tools: list[dict] = []
        self.alive = False
        self._next_id = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._reader_task: asyncio.Task | None = None

    async def start(self) -> bool:
        """Spawn the server, run the MCP initialize handshake, list its tools.
        Returns True on success; never raises (a dead server is just 'down')."""
        try:
            environ = {**os.environ, **{k: str(v) for k, v in self.env.items()}}
            # A .py command is run with the current interpreter so users don't
            # need it on PATH or marked executable.
            argv = [self.command, *self.args]
            if self.command.endswith(".py"):
                argv = [sys.executable, self.command, *self.args]
            self.proc = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                cwd=str(CONFIG_PATH.parent),
                env=environ,
            )
        except Exception as e:  # noqa: BLE001 - report and keep the host alive
            log(f"[{self.name}] could not launch '{self.command}': {e}")
            return False

        self._reader_task = asyncio.ensure_future(self._read_loop())
        try:
            await self._request(
                "initialize",
                {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": CLIENT_INFO,
                },
                timeout=15,
            )
            await self._notify("notifications/initialized", {})
            result = await self._request("tools/list", {}, timeout=15)
            self.tools = result.get("tools", []) if isinstance(result, dict) else []
            self.alive = True
            log(f"[{self.name}] connected - {len(self.tools)} tools")
            return True
        except Exception as e:  # noqa: BLE001
            log(f"[{self.name}] MCP handshake failed: {e}")
            self.alive = False
            return False

    async def call_tool(self, tool: str, params: dict) -> dict:
        """Invoke a tool and return a flattened {ok, output} result."""
        if not self.alive:
            return {"ok": False, "output": f"server '{self.name}' is not connected"}
        try:
            res = await self._request("tools/call", {"name": tool, "arguments": params or {}}, timeout=120)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "output": f"call failed: {e}"}
        text = _flatten_content(res.get("content", [])) if isinstance(res, dict) else str(res)
        is_error = bool(isinstance(res, dict) and res.get("isError"))
        return {"ok": not is_error, "output": text}

    # -- JSON-RPC plumbing --
    async def _request(self, method: str, params: dict, timeout: float):
        assert self.proc and self.proc.stdin
        self._next_id += 1
        rid = self._next_id
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[rid] = fut
        self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        try:
            return await asyncio.wait_for(fut, timeout)
        finally:
            self._pending.pop(rid, None)

    async def _notify(self, method: str, params: dict) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params})

    def _send(self, obj: dict) -> None:
        if self.proc and self.proc.stdin:
            self.proc.stdin.write((json.dumps(obj) + "\n").encode("utf-8"))

    async def _read_loop(self) -> None:
        assert self.proc and self.proc.stdout
        while True:
            line = await self.proc.stdout.readline()
            if not line:
                break  # process closed its stdout -> it exited
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue  # MCP servers sometimes print non-protocol noise
            rid = msg.get("id")
            if rid in self._pending and not self._pending[rid].done():
                if "error" in msg:
                    self._pending[rid].set_exception(RuntimeError(msg["error"].get("message", "MCP error")))
                else:
                    self._pending[rid].set_result(msg.get("result", {}))
        self.alive = False
        log(f"[{self.name}] disconnected")

    async def stop(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()
        if self.proc and self.proc.returncode is None:
            try:
                self.proc.terminate()
            except ProcessLookupError:
                pass


def _flatten_content(content: list) -> str:
    """MCP tool results are a list of content parts; join the text ones."""
    parts = []
    for part in content or []:
        if isinstance(part, dict):
            if part.get("type") == "text":
                parts.append(part.get("text", ""))
            else:
                parts.append(json.dumps(part))
        else:
            parts.append(str(part))
    return "\n".join(parts)


# ── the host: manages every configured MCP server ──────────────────────────
class McpHost:
    def __init__(self):
        self.servers: dict[str, McpServer] = {}

    def load_config(self) -> None:
        if not CONFIG_PATH.exists():
            log(f"no config.json at {CONFIG_PATH} - starting with no MCP servers")
            return
        try:
            cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            log(f"config.json is not valid JSON: {e}")
            return
        for name, spec in (cfg.get("mcpServers") or {}).items():
            self.servers[name] = McpServer(
                name, spec.get("command", ""), spec.get("args", []), spec.get("env", {})
            )

    async def start_all(self) -> None:
        await asyncio.gather(*(s.start() for s in self.servers.values()), return_exceptions=True)

    def all_tools(self) -> list[dict]:
        """Aggregate tools across servers, prefixing so calls can be routed back."""
        out = []
        for name, srv in self.servers.items():
            for t in srv.tools:
                out.append({**t, "_server": name})
        return out

    async def call(self, tool: str, params: dict) -> dict:
        # Accept either "server/tool" or a bare tool name (first server that has it).
        server_name, _, bare = tool.partition("/")
        if bare and server_name in self.servers:
            return await self.servers[server_name].call_tool(bare, params)
        for srv in self.servers.values():
            if any(t.get("name") == tool for t in srv.tools):
                return await srv.call_tool(tool, params)
        return {"ok": False, "output": f"no connected server exposes tool '{tool}'"}

    def status(self) -> dict:
        servers = [{"id": n, "alive": s.alive, "tools": len(s.tools)} for n, s in self.servers.items()]
        studio = any(s.alive for n, s in self.servers.items() if "roblox" in n.lower() or "studio" in n.lower())
        return {
            "connected": True,
            "studio": studio if servers else False,
            "tools": sum(len(s.tools) for s in self.servers.values()),
            "servers": servers,
        }

    async def stop_all(self) -> None:
        await asyncio.gather(*(s.stop() for s in self.servers.values()), return_exceptions=True)


# ── the WebSocket server the extension talks to ────────────────────────────
class Bridge:
    def __init__(self, host: McpHost):
        self.host = host
        self.clients: set = set()

    async def serve(self) -> None:
        async with websockets.serve(self._on_client, HOST, PORT, ping_interval=20):
            log(f"listening on ws://{HOST}:{PORT}")
            await asyncio.Future()  # run forever

    async def _on_client(self, ws) -> None:
        self.clients.add(ws)
        try:
            await self._send(ws, {"type": "status", **self.host.status()})
            async for raw in ws:
                await self._handle(ws, raw)
        except websockets.ConnectionClosed:
            pass
        finally:
            self.clients.discard(ws)

    async def _handle(self, ws, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        kind = msg.get("type")
        if kind == "hello":
            # status() has a numeric "tools" count; keep the tool LIST here and
            # only borrow the connection fields so the two don't collide.
            st = self.host.status()
            await self._send(ws, {
                "type": "ready", "tools": self.host.all_tools(),
                "connected": st["connected"], "studio": st["studio"], "servers": st["servers"],
            })
        elif kind == "list_tools":
            await self._send(ws, {"type": "tools", "tools": self.host.all_tools()})
        elif kind == "ping":
            await self._send(ws, {"type": "pong", **self.host.status()})
        elif kind == "call":
            rid = msg.get("id")
            res = await self.host.call(msg.get("tool", ""), msg.get("params") or {})
            await self._send(ws, {"type": "result", "id": rid, **res})
        # unknown types are ignored on purpose (forward-compatible)

    @staticmethod
    async def _send(ws, obj: dict) -> None:
        try:
            await ws.send(json.dumps(obj))
        except websockets.ConnectionClosed:
            pass

    async def broadcast_status(self) -> None:
        payload = json.dumps({"type": "status", **self.host.status()})
        for ws in list(self.clients):
            try:
                await ws.send(payload)
            except websockets.ConnectionClosed:
                self.clients.discard(ws)


# ── entrypoint ─────────────────────────────────────────────────────────────
async def amain() -> int:
    log(f"VoidScript bridge (rebuild) starting - port {PORT}")
    host = McpHost()
    host.load_config()
    await host.start_all()
    bridge = Bridge(host)
    try:
        await bridge.serve()
    except OSError as e:
        log(f"could not bind ws://{HOST}:{PORT}: {e}")
        log("Another bridge is probably already running. Close it and retry.")
        return 1
    finally:
        await host.stop_all()
    return 0


def main() -> int:
    try:
        return asyncio.run(amain())
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
