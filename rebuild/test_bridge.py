#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""End-to-end test for rebuild/bridge.py against the mock MCP server. Starts the
bridge as a subprocess with a config pointing at mock_mcp_server.py, then drives
the VoidScript WebSocket protocol and checks the replies. No Roblox needed."""
import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import websockets

HERE = Path(__file__).resolve().parent
PORT = "17699"  # off the default 17613 so it never clashes with a real bridge


async def recv_type(ws, wanted, timeout=5):
    """Read messages until one with type == wanted (tolerates the status broadcast)."""
    end = time.time() + timeout
    while time.time() < end:
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
        if msg.get("type") == wanted:
            return msg
    raise AssertionError(f"never received a '{wanted}' message")


async def run() -> int:
    cfg = {"mcpServers": {"roblox": {"command": "mock_mcp_server.py", "args": []}}}
    (HERE / "test_config.json").write_text(json.dumps(cfg), encoding="utf-8")
    env = {**os.environ, "VOID_CONFIG": str(HERE / "test_config.json"), "ZS_BRIDGE_PORT": PORT}
    proc = subprocess.Popen([sys.executable, str(HERE / "bridge.py")], env=env)

    passed = 0
    try:
        # give the bridge a moment to spawn the mock server and bind the socket
        await asyncio.sleep(2.0)
        async with websockets.connect(f"ws://127.0.0.1:{PORT}") as ws:
            status = await recv_type(ws, "status")
            assert status["connected"] is True, status
            assert status["studio"] is True, "roblox server should count as studio"
            assert status["tools"] == 1, status
            print("PASS  status broadcast on connect"); passed += 1

            await ws.send(json.dumps({"type": "hello", "version": "test"}))
            ready = await recv_type(ws, "ready")
            names = [t["name"] for t in ready["tools"]]
            assert names == ["echo"], names
            print("PASS  hello -> ready with aggregated tools"); passed += 1

            await ws.send(json.dumps({"type": "list_tools"}))
            tools = await recv_type(ws, "tools")
            assert tools["tools"][0]["_server"] == "roblox", tools
            print("PASS  list_tools routes/labels by server"); passed += 1

            await ws.send(json.dumps({"type": "call", "id": 7, "tool": "echo", "params": {"text": "hi"}}))
            result = await recv_type(ws, "result")
            assert result["id"] == 7 and result["ok"] is True, result
            assert result["output"] == "echoed: hi", result
            print("PASS  call -> result round-trips through MCP"); passed += 1

            await ws.send(json.dumps({"type": "call", "id": 8, "tool": "nope", "params": {}}))
            bad = await recv_type(ws, "result")
            assert bad["id"] == 8 and bad["ok"] is False, bad
            print("PASS  unknown tool -> ok:false error"); passed += 1

            await ws.send(json.dumps({"type": "ping"}))
            pong = await recv_type(ws, "pong")
            assert pong["studio"] is True, pong
            print("PASS  ping -> pong with status"); passed += 1

            await ws.send(json.dumps({"type": "restart", "server": "roblox"}))
            restarted = await recv_type(ws, "restarted")
            assert restarted["studio"] is True and restarted["tools"] == 1, restarted
            print("PASS  restart -> server re-launched, tools back"); passed += 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        for f in ("test_config.json",):
            try:
                (HERE / f).unlink()
            except FileNotFoundError:
                pass

    print(f"\n{passed}/7 checks passed")
    return 0 if passed == 7 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
