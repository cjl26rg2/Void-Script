#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
VoidScript bridge (self-made, clean-room rebuild — Phase 1).

Role: a tiny local MCP *host*. It launches the MCP servers listed in
config.json (Roblox Studio's among them), speaks the standard Model Context
Protocol (JSON-RPC 2.0 over each server's stdio), and exposes their aggregated
tools to the browser extension over a WebSocket on 127.0.0.1:<PORT>.

This is an independent implementation built from the public MCP specification
and the documented Roblox Studio MCP behavior. Extension-facing protocol is
VoidScript's own (see REBUILD.md, "Extension <-> Bridge"):

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
PORT = int(os.environ.get("VOID_BRIDGE_PORT", "17613"))
CONFIG_PATH = Path(os.environ.get("VOID_CONFIG", HERE / "config.json"))
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
                stderr=asyncio.subprocess.PIPE,  # surfaced to the log (launch errors etc.)
                cwd=str(CONFIG_PATH.parent),
                env=environ,
            )
            asyncio.ensure_future(self._stderr_loop())
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
        params = self._normalize_params(tool, params or {})
        try:
            res = await self._request("tools/call", {"name": tool, "arguments": params}, timeout=120)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "output": f"call failed: {e}"}
        text = _flatten_content(res.get("content", [])) if isinstance(res, dict) else str(res)
        is_error = bool(isinstance(res, dict) and res.get("isError"))
        return {"ok": not is_error, "output": text}

    def _normalize_params(self, tool: str, params: dict) -> dict:
        """Fill missing required parameters that StudioMCP needs to actually run
        against the user's open place. The model regularly omits datamodel_type
        on execute_luau / multi_edit / etc.; the call then comes back ok while
        nothing happens in the visible Studio — the classic "it ran but nothing
        changed" bug.

        The value is read from the tool's schema enum, never hardcoded: some
        StudioMCP builds only accept "game" and reject "edit" with
        "Invalid datamodel_type". Prefer "edit" when the schema allows it,
        otherwise fall back to the first declared option, then "game"."""
        entry = next((t for t in self.tools if t.get("name") == tool), None)
        if not entry:
            return params
        schema = entry.get("inputSchema") or {}
        props = schema.get("properties") or {}
        required = schema.get("required") or []
        if "datamodel_type" in props and "datamodel_type" not in params:
            dm = props["datamodel_type"]
            options = dm.get("enum") or dm.get("options") or []
            if "edit" in options:
                pick = "edit"
            elif options:
                pick = options[0]
            else:
                pick = "game"
            if "datamodel_type" in required or options:
                params = {**params, "datamodel_type": pick}
        return params

    async def refresh(self) -> bool:
        """Re-fetch this server's tools if it is alive. Returns True if the count
        changed (e.g. Studio just attached and its tools appeared)."""
        if not self.alive:
            return False
        try:
            result = await self._request("tools/list", {}, timeout=10)
        except Exception:  # noqa: BLE001
            return False
        new = result.get("tools", []) if isinstance(result, dict) else []
        changed = len(new) != len(self.tools)
        self.tools = new
        return changed

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

    async def _stderr_loop(self) -> None:
        # StudioMCP / launch_studio_mcp.py print helpful diagnostics here
        # ("using <path>", "no StudioMCP.exe found ..."). Surface them so a
        # failed launch is visible instead of silent.
        if not (self.proc and self.proc.stderr):
            return
        while True:
            line = await self.proc.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", "replace").rstrip()
            if text:
                log(f"[{self.name}:err] {text}")

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
        # Whether a Roblox Studio instance is actually attached. StudioMCP always
        # exposes its ~27 tools even with Studio closed, so tool-count is not a
        # signal; we probe list_roblox_studios (empty "studios" == none open).
        self.studio_attached = False
        # Consecutive probes that saw no Studio. A little hysteresis stops a
        # transient probe failure (slow call, brief blip) from flipping a working
        # attach to "offline" and blocking the user's commands.
        self._studio_misses = 0
        # Auto-recovery bookkeeping for servers whose process died (see
        # recover_servers): monotonic timestamps + attempt counts per server.
        self._last_restart: dict[str, float] = {}
        self._restart_count: dict[str, int] = {}

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

    async def refresh_all(self) -> bool:
        """Re-list every live server's tools. Roblox's StudioMCP proxies Studio's
        tool set, which is EMPTY until Studio is open with the MCP server enabled
        — so re-listing is how tools appear when Studio attaches AFTER the bridge
        started. Returns True if any server's tool count changed."""
        results = await asyncio.gather(*(s.refresh() for s in self.servers.values()), return_exceptions=True)
        return any(r is True for r in results)

    async def restart(self, name: str | None) -> None:
        """Restart one server by name, or all when name is falsy. Used by the
        popup's 'Restart Roblox server' action."""
        targets = [n for n in self.servers if name in (None, "", n)]
        for n in targets:
            old = self.servers[n]
            await old.stop()
            fresh = McpServer(n, old.command, old.args, old.env)
            self.servers[n] = fresh
            await fresh.start()

    async def recover_servers(self) -> bool:
        """Auto-restart any configured server whose process has died (StudioMCP
        can exit on its own, silently taking down every tool call). Bounded: max
        one restart per server per 30s and 5 total, so a genuinely broken server
        doesn't hot-loop. Returns True if any server came back."""
        recovered = False
        now = time.monotonic()
        for n, s in self.servers.items():
            if s.alive:
                self._restart_count.pop(n, None)
                continue
            attempts = self._restart_count.get(n, 0)
            if attempts >= 5:
                continue
            if now - self._last_restart.get(n, 0) < 30:
                continue
            self._last_restart[n] = now
            self._restart_count[n] = attempts + 1
            log(f"[{n}] process not running - auto-restarting (attempt {attempts + 1}/5)")
            fresh = McpServer(n, s.command, s.args, s.env)
            self.servers[n] = fresh
            await fresh.start()
            recovered = recovered or fresh.alive
        return recovered

    # Diagnostic/state tools are harmless without a live Studio and are what we
    # probe with (list_roblox_studios, get_studio_state), so they may always run.
    _DIAG_TOOLS = ("list_roblox_studios", "get_studio_state", "list_tools")

    async def call(self, tool: str, params: dict) -> dict:
        # Accept either "server/tool" or a bare tool name (first server that has it).
        srv = None
        server_name, _, bare = tool.partition("/")
        if bare and server_name in self.servers:
            srv = self.servers[server_name]
            tool_to_call = bare
        else:
            for cand in self.servers.values():
                if any(t.get("name") == tool for t in cand.tools):
                    srv = cand
                    tool_to_call = tool
                    break
        if srv is None:
            return {"ok": False, "output": f"no connected server exposes tool '{tool}'"}

        # Roblox Studio tools ONLY work against a real, attached Studio. We still
        # re-probe here to keep the status/popup honest, but we NEVER hard-block a
        # call: a flaky probe must not freeze out a live Studio (that was the
        # "rejecting every command before execution" bug). If Studio is genuinely
        # closed, StudioMCP itself answers with a clear error which we pass
        # through to the caller.
        if not (
            bare in self._DIAG_TOOLS or tool in self._DIAG_TOOLS
            or not self._is_studio_server(srv)
        ):
            await self.probe_studio()
        return await srv.call_tool(tool_to_call, params)

    def _roblox_server(self) -> "McpServer | None":
        for n, s in self.servers.items():
            if "roblox" in n.lower() or "studio" in n.lower():
                return s
        return None

    def _is_studio_server(self, srv: "McpServer") -> bool:
        return srv is self._roblox_server()

    async def probe_studio(self) -> bool:
        """Ask the roblox server whether a live Studio is connected. Sets
        studio_attached and returns True if the value changed.

        Detection is deliberately multi-signal + hysteresis: get_studio_state
        only answers when the proxy actually reaches a Studio, list_roblox_studios
        is the fallback, and a transient miss never flips a working attach to
        offline (that used to wrongly block users whose Studio was open)."""
        prev = self.studio_attached
        attached = await self._sample_studio_attachment()
        if attached:
            self._studio_misses = 0
        else:
            self._studio_misses += 1
            # Keep reporting attached unless we miss several probes in a row.
            # A single slow/timeout probe is not evidence the user closed Studio.
            if prev and self._studio_misses < 3:
                return False
        self.studio_attached = attached
        return attached != prev

    async def _sample_studio_attachment(self) -> bool:
        srv = self._roblox_server()
        if not srv or not srv.alive:
            return False
        # get_studio_state only returns ok when the proxy has a Studio it can
        # reach; when Studio is closed/MCP off it comes back as an MCP error.
        res = await srv.call_tool("get_studio_state", {})
        if res.get("ok"):
            return True
        # Fall back to the explicit studio list.
        res = await srv.call_tool("list_roblox_studios", {})
        if not res.get("ok"):
            return False
        out = res.get("output") or ""
        try:
            return bool(json.loads(out).get("studios"))
        except Exception:  # noqa: BLE001 - be lenient about the exact shape
            return "studios" in out and '"studios":[]' not in out.replace(" ", "")

    def status(self) -> dict:
        servers = [{"id": n, "alive": s.alive, "tools": len(s.tools)} for n, s in self.servers.items()]
        return {
            "connected": True,
            "studio": self.studio_attached,
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
            asyncio.ensure_future(self._pulse())
            await asyncio.Future()  # run forever

    async def _pulse(self) -> None:
        # Re-list tools every few seconds so Studio attaching AFTER the bridge
        # started is picked up (its tools appear), broadcast when it changes, and
        # auto-recover a server process that silently exited (StudioMCP sometimes
        # dies on its own - a dead process otherwise blocks every tool call while
        # the user still has Studio open).
        while True:
            await asyncio.sleep(5)
            try:
                recovered = await self.host.recover_servers()
                changed = await self.host.refresh_all()
                changed = (await self.host.probe_studio()) or changed
                if recovered or changed:
                    log("status changed -> " + ("Studio attached" if self.host.studio_attached else "no Studio"))
                    await self.broadcast_status()
            except Exception:  # noqa: BLE001
                pass

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
        elif kind == "restart":
            await self.host.restart(msg.get("server"))
            await self._send(ws, {"type": "restarted", **self.host.status()})
            await self.broadcast_status()
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
    log(f"VoidScript bridge starting - port {PORT}")
    host = McpHost()
    host.load_config()
    bridge = Bridge(host)

    # Launch the MCP servers + probe Studio in the BACKGROUND so the WebSocket is
    # up immediately. Otherwise the ~8s StudioMCP handshake delays 'listening',
    # the extension's first connect attempts fail, and its service worker sleeps
    # before retrying — the popup then stays "offline".
    async def boot():
        await host.start_all()
        await host.probe_studio()
        log("Studio attached" if host.studio_attached else "no Studio open yet (start it and it'll attach)")
        await bridge.broadcast_status()
    asyncio.ensure_future(boot())
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
