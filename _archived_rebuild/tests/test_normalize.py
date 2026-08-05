#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Unit tests for bridge.McpServer._normalize_params — the datamodel_type
defaulting. Regression for the "Invalid datamodel_type: edit" bug, where some
StudioMCP builds only accept "game" and reject a hardcoded "edit"."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import bridge  # noqa: E402


def make_server(tools):
    s = bridge.McpServer("roblox", "x.py", [], {})
    s.tools = tools
    return s


def dm_schema(enum, required=False):
    props = {
        "code": {"type": "string"},
        "datamodel_type": {"type": "string"},
    }
    if enum is not None:
        props["datamodel_type"]["enum"] = list(enum)
    required_list = ["code"] + (["datamodel_type"] if required else [])
    return {"type": "object", "properties": props, "required": required_list}


def run():
    passed = 0

    # StudioMCP build that only accepts "game" -> must NOT send "edit"
    s = make_server([{"name": "execute_luau", "inputSchema": dm_schema(["game"], required=True)}])
    out = s._normalize_params("execute_luau", {"code": "print(1)"})
    assert out["datamodel_type"] == "game", out
    print("PASS  schema enum [game] -> fills 'game'"); passed += 1

    # Full StudioMCP build that accepts both -> keep "edit" (modify the place)
    s = make_server([{"name": "execute_luau", "inputSchema": dm_schema(["game", "edit"], required=True)}])
    out = s._normalize_params("execute_luau", {"code": "print(1)"})
    assert out["datamodel_type"] == "edit", out
    print("PASS  schema enum [game, edit] -> fills 'edit'"); passed += 1

    # No enum declared, required -> safest universal value "game"
    s = make_server([{"name": "execute_luau", "inputSchema": dm_schema(None, required=True)}])
    out = s._normalize_params("execute_luau", {"code": "print(1)"})
    assert out["datamodel_type"] == "game", out
    print("PASS  no enum -> fills 'game'"); passed += 1

    # Model already sent a value -> never overridden
    s = make_server([{"name": "execute_luau", "inputSchema": dm_schema(["game"])}])
    out = s._normalize_params("execute_luau", {"code": "print(1)", "datamodel_type": "game"})
    assert out["datamodel_type"] == "game" and out["code"] == "print(1)", out
    print("PASS  explicit param left untouched"); passed += 1

    # Optional, no enum, model omitted it -> untouched (server default applies)
    s = make_server([{"name": "execute_luau", "inputSchema": dm_schema(None)}])
    out = s._normalize_params("execute_luau", {"code": "print(1)"})
    assert out == {"code": "print(1)"}, out
    print("PASS  optional, no enum -> left to server default"); passed += 1

    # Tool without datamodel_type at all -> params unchanged
    s = make_server([{"name": "echo", "inputSchema": {"type": "object", "properties": {"text": {}}}}])
    out = s._normalize_params("echo", {"text": "hi"})
    assert out == {"text": "hi"}, out
    print("PASS  tool without datamodel_type unchanged"); passed += 1

    # Unknown tool -> unchanged
    out = s._normalize_params("nope", {"a": 1})
    assert out == {"a": 1}, out
    print("PASS  unknown tool unchanged"); passed += 1

    print(f"\n{passed}/7 checks passed")
    return 0 if passed == 7 else 1


if __name__ == "__main__":
    raise SystemExit(run())
