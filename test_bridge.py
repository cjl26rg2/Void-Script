# Checks for the bridge's duplicate-command ledger and Windows process helpers.
# Imports bridge.py without starting it (no ports are opened). Run: python test_bridge.py
import asyncio
import json
import sys

import bridge

fails = 0


def ok(name, cond):
    global fails
    print(("PASS  " if cond else "FAIL  ") + name)
    if not cond:
        fails += 1


class FakeWS:
    def __init__(self):
        self.sent = []

    async def send(self, raw):
        self.sent.append(json.loads(raw))


runs = []


async def fake_run(name, args, timeout):
    runs.append(name)
    await asyncio.sleep(0.05)
    if args.get("fail"):
        return {"ok": False, "error": "boom", "kind": "Exception"}
    return {"ok": True, "text": f"ran {name}", "images": []}


async def main():
    bridge._run_tool = fake_run
    ws = FakeWS()

    # same request twice in a row: runs once, second gets the earlier result
    await bridge.run_tool_task(ws, "execute_luau", {}, 5, "a", "req-1")
    await bridge.run_tool_task(ws, "execute_luau", {}, 5, "b", "req-1")
    ok("duplicate runs once", runs.count("execute_luau") == 1)
    ok("duplicate is flagged", ws.sent[1].get("duplicate") is True and ws.sent[1]["text"] == "ran execute_luau")

    # two tabs at the same moment: the second waits for the first
    runs.clear()
    await asyncio.gather(
        bridge.run_tool_task(ws, "multi_edit", {}, 5, "c", "req-2"),
        bridge.run_tool_task(ws, "multi_edit", {}, 5, "d", "req-2"),
    )
    ok("overlapping duplicate runs once", runs.count("multi_edit") == 1)

    # a failure is not remembered, so a real retry runs again
    runs.clear()
    await bridge.run_tool_task(ws, "script_read", {"fail": True}, 5, "e", "req-3")
    await bridge.run_tool_task(ws, "script_read", {"fail": True}, 5, "f", "req-3")
    ok("failed call can be retried", runs.count("script_read") == 2)

    # no request id (the app's own calls): never deduped
    runs.clear()
    await bridge.run_tool_task(ws, "get_studio_state", {}, 5, "g")
    await bridge.run_tool_task(ws, "get_studio_state", {}, 5, "h")
    ok("calls without an id always run", runs.count("get_studio_state") == 2)

    # different commands with different ids both run
    runs.clear()
    await bridge.run_tool_task(ws, "a1", {}, 5, "i", "req-4")
    await bridge.run_tool_task(ws, "a2", {}, 5, "j", "req-5")
    ok("different ids both run", runs == ["a1", "a2"])


asyncio.run(main())

if sys.platform == "win32":
    import winproc
    ok("process list readable", len(winproc.processes()) > 10)
    ok("explorer is running", winproc.running("explorer.exe") is True)
    ok("unknown exe not running", winproc.running("no-such-voidscript-test.exe") is False)
    ok("free port has no owner", winproc.port_owner(1) is None)

sys.exit(1 if fails else 0)
