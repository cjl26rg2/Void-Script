#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""A tiny fake MCP server (stdio, newline-delimited JSON-RPC 2.0) used only to
test rebuild/bridge.py without a live Roblox Studio. Exposes one 'echo' tool."""
import json
import sys

TOOLS = [{
    "name": "echo",
    "description": "Echoes back the text you give it.",
    "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}},
}]


def send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        method, rid = msg.get("method"), msg.get("id")
        if method == "initialize":
            send({"jsonrpc": "2.0", "id": rid, "result": {
                "protocolVersion": "2024-11-05", "capabilities": {},
                "serverInfo": {"name": "mock", "version": "1.0"}}})
        elif method == "notifications/initialized":
            pass  # notification, no reply
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": rid, "result": {"tools": TOOLS}})
        elif method == "tools/call":
            args = (msg.get("params") or {}).get("arguments", {})
            send({"jsonrpc": "2.0", "id": rid, "result": {
                "content": [{"type": "text", "text": f"echoed: {args.get('text', '')}"}]}})
        elif rid is not None:
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "method not found"}})


if __name__ == "__main__":
    main()
