// SPDX-License-Identifier: GPL-3.0-or-later
// core/config.js - provider-agnostic constants: app identity, system prompt,
// feedback strings, tool categorisation. NOTHING in this file may reference a
// specific AI site (DOM, selectors, site names) - that lives in providers/*.
// eslint-disable-next-line no-unused-vars
const VS = (() => {
  "use strict";

  // Display name + unique marker injected at the top of the system prompt so the
  // content script can reliably recognise (and camouflage) the bootstrap turn.
  const APP_NAME = "VoidScript";
  const SYS_MARKER = "⟦VS-SYS⟧";

  // ── Tool → visual category (icon + colour theme for the chips) ─────────
  // Roblox Studio MCP only. Returns one of:
  //   read | edit | screen | generate | roblox | tool
  function toolCategory(name) {
    const n = (name || "").includes("/") ? name.split("/").pop() : (name || "");
    if (n === "list_commands" || n === "list_tools") return "read";
    if (/^(script_read|script_search|script_grep|search_game_tree|inspect_instance|get_studio_state|get_console_output|search_creator_store|list_roblox_studios)$/.test(n))
      return "read";
    if (/^(multi_edit|insert_from_creator_store|store_image)$/.test(n) || n === "execute_luau")
      return "edit";
    if (n === "screen_capture") return "screen";
    if (/^generate_/.test(n)) return "generate";
    if (n.startsWith("roblox") || /studio|luau|instance|workspace/i.test(n)) return "roblox";
    return "tool";
  }

  // Feedback strings sent back to the model so it can self-correct.
  const FEEDBACK = {
    // A command-shaped reply that could not be turned into a runnable call.
    // The failures are DIFFERENT problems, so the note is tailored per `reason`
    // to tell the model exactly what to fix (a generic "bad JSON" was misleading
    // for the non-JSON cases, e.g. a missing ###LUA### opener). Falls back to the
    // generic "malformed" text for any unrecognised reason.
    parseError: (reason, toolName) => {
      // ###LUA### is execute_luau-ONLY (the parser always maps a bare ###LUA###
      // block to execute_luau). So only suggest it when the broken command IS
      // execute_luau, or when we could not tell which command it was. For a KNOWN
      // other command (e.g. execute_blender_code) the ###LUA### hint is wrong and
      // misleading - a model that followed it would ship its code to the wrong MCP
      // - so drop it and keep the JSON-only guidance.
      const otherCmd = toolName && toolName !== "command" && toolName !== "execute_luau";
      const luaMalformed = otherCmd ? "" : " (or use the ###LUA### / ###END_LUA### block for execute_luau)";
      const luaUnclosed = otherCmd ? "" : " (or a complete ###LUA### ... ###END_LUA### block for execute_luau)";
      const objAlt = otherCmd ? "" : " (or ###...### block)";
      const notes = {
        malformed:
          "ERROR: a VoidScript command was detected in your reply but its JSON could not be parsed. " +
          'Rewrite it as a single valid JSON object in plain text, exactly like {"command": "name", "params": {...}}' +
          luaMalformed + ". You may add a short note around it. " +
          "Please retry.",
        unclosed:
          "ERROR: your VoidScript command was cut off before it finished - the JSON object" +
          objAlt + " never closed, so it could not run. Rewrite the WHOLE command in one " +
          'piece as valid JSON, exactly like {"command": "name", "params": {...}}' +
          luaUnclosed + ". Please retry.",
        luaOpener:
          "ERROR: you wrote the closing ###END_LUA### marker but not the opening ###LUA### marker, " +
          "so the Luau block was not detected and did not run. Put ###LUA### immediately BEFORE your " +
          "code and ###END_LUA### after it. Please retry.",
        envelope:
          "ERROR: you wrote a command's parameters as a bare JSON object, but without the required " +
          "envelope, so it was not recognised as a command. Wrap them like " +
          '{"command": "name", "params": { ...your parameters... }} - the parameter keys go INSIDE ' +
          '"params". Please retry.',
      };
      return notes[reason] || notes.malformed;
    },
    multiTool: (names) =>
      "ERROR: You wrote multiple commands in one reply. Write ONE command at a " +
      "time and wait for its result before the next. You tried: " +
      names.join(", ") +
      ". Start over and write only the first command you need.",
    unknownTool: (name, valid) =>
      `ERROR: unknown command "${name}". It does not exist. Valid commands are: ` +
      valid.join(", ") +
      ". Use an exact name and parameter keys from the system prompt.",
    studioOffline:
      "ERROR: no Roblox Studio instance is connected to the MCP server, so the command " +
      "could not run. Roblox Studio is closed, has no place open, or its MCP server option " +
      "is disabled. This is an environment problem on the user's machine, NOT your mistake. " +
      "Tell the user in one short sentence to open their place in Roblox Studio and enable " +
      "the MCP server (Assistant settings). Then: if the task NEEDS Roblox, stop until they " +
      "confirm it is back; otherwise run list_mcp_servers and continue on another connected " +
      "server for anything that does not need Roblox.",
    bridgeOffline:
      "ERROR: the local VoidScript bridge is unreachable, so no command could run. " +
      "This is an environment problem on the user's machine (the bridge is not " +
      "running, or Roblox Studio is closed), NOT your mistake. Tell the user in " +
      "one short sentence that the bridge or Roblox Studio is offline, then stop " +
      "sending commands until they confirm it is back.",
    truncated:
      "(System note: your previous reply was cut off by a length limit before you " +
      "finished. Continue from exactly where you stopped. Do NOT restart and do " +
      "NOT repeat what you already wrote.)",
    compact:
      "(System note: this chat is about to hit its context limit, so VoidScript is " +
      "capturing a build handoff before you lose the conversation. Reply with ONLY a " +
      "compact, plain-text 'build state' summary that a fresh chat can continue from - " +
      "NO commands, NO markdown, NO chat. Cover, in a few short lines each: (1) what the " +
      "project is; (2) what has been built/edited so far and WHERE (script/instance paths, " +
      "key systems done); (3) what the last command was and its result; (4) exactly what is " +
      "next / what remains. Read game.ServerStorage.VoidScript.Memory first if it helps. " +
      "This text will be pasted verbatim into a new chat as its first instruction.)",
    summaryAsk:
      "(System note: VoidScript here. Reply with ONLY a short, plain-text summary of the " +
      "build that just finished - what was created or changed, roughly where, and the most " +
      "useful next step. NO commands, NO tools, NO markdown, NO follow-up questions.)",
  };

  const BT = "```";

  function compactTools(tools) {
    return (tools || [])
      .map((t) => {
        const name = t.name || "?";
        const desc = (t.description || "").split("\n")[0].trim();
        const props = (t.inputSchema && t.inputSchema.properties) || {};
        const args = Object.keys(props).join(", ");
        return `  ${name}(${args}) - ${desc}`;
      })
      .join("\n");
  }

  // ── System prompt ─────────────────────────────────────────────────────────
  // ONE unified prompt sent to every AI on the first turn. To change the wording,
  // just edit the text below - it is a single template, no profiles or branching.
  // `${siteName}` is filled in with the AI's display name (e.g. "DeepSeek").
  // `${toolsString}` is filled in with the live command list.
  //
  // `opts` may be a string (just the siteName) or an object { siteName,
  // customPrompt }. `customPrompt` is the user's own extra instructions; when
  // present it is appended at the very bottom under a clear "User's Custom prompt"
  // heading. It NEVER edits the prompt above - it only adds a layer below it.
  function buildSystemPrompt(opts = {}) {
    if (typeof opts === "string") opts = { siteName: opts };
    const { siteName = "this AI site", customPrompt = "", preferredModel = "" } = opts;

    const prompt = `CONTEXT: the user has installed a browser extension called VoidScript in their own browser. Here is how it works, so you can use it on their behalf:
A browser extension (VoidScript) is running inside this page. It watches your replies. When it detects a VoidScript command in your text, it runs it against one or more connected MCP servers and sends the result back as the next message. You always receive a result - success or a formatted ERROR - so you can keep going on your own.

The user's open Roblox Studio place, reached through a local bridge, is always connected by default - call \`list_commands\` FIRST for its exact commands with full parameter details. Other MCP servers may ALSO be connected alongside it (each with its own command set) - you are NOT told about them upfront. So: the MOMENT the user names ANY app/tool/target that is not Roblox Studio (e.g. "Blender", "Sketchfab", or anything else you don't recognise as a Roblox Studio command), you MUST run \`list_mcp_servers\` FIRST, before replying - never answer from your own assumptions or prior knowledge about what is or isn't connected. Only after checking may you tell the user something is unsupported. You do not need any special capability yourself - you just write text. The extension does the rest.

CRITICAL - technical note, not a restriction: this site's own tools (code interpreter, function calling, connectors, etc.) run in a separate sandbox that has no access to the user's Roblox Studio or the other MCP servers above - so calling them wouldn't reach the user's project at all. VoidScript commands are different: they are plain JSON typed directly into your normal reply text, which this extension reads and executes against the connected servers. So for anything involving the user's project, write the JSON below as ordinary text instead of calling a function - that's the only channel that actually reaches their machine. (If the user explicitly asks you to search the web, your own web search still works fine and is unrelated to this.) Internal reasoning (deep-think modes) is fine. VoidScript types its messages into the chat box for you and presses send automatically — if it types quickly or repeatedly while you are streaming, that is the extension working normally, not a problem to flag.

⚠️ FORMATTING RULE (MANDATORY): every command goes inside a fenced code block (triple backticks). Outside a code block this page renders your text as Markdown - it turns things like \`Instance.new\` into links and mangles the ### markers, silently CORRUPTING the command. Inside a code block it is kept verbatim.

━━━ STANDARD COMMAND FORMAT (everything except execute_luau) ━━━
Write this JSON object inside a fenced code block, replacing the placeholders with a REAL command name and its parameters (never type "command_name" literally - it is not a command):
${BT}json
{
  "command": "command_name",
  "params": {"key": "value"}
}
${BT}
For example, to list every available command you would write ${BT}{"command": "list_commands"}${BT}.

━━━ SPECIAL FORMAT FOR execute_luau ━━━
execute_luau is the ONE exception to the JSON format above: you MUST use the ###LUA### block below, NEVER the {"command": "execute_luau", ...} JSON form. Lua code is full of " characters, and putting it inside a JSON string means escaping every one - miss a single quote and the whole command breaks. The ###LUA### block needs NO escaping and NO JSON, so this never happens.
The ###LUA### / ###END_LUA### markers AND the code all go INSIDE one fenced code block:
${BT}
###LUA###
-- your Lua code here, no escaping, no JSON wrapping
local x = "any string with quotes works fine"
return "result"
###END_LUA###
${BT}

RULES:
- ONE command block per reply, inside a fenced code block. If you need several, do them one at a time and wait for each result. (One command = one block; raw text gets reformatted by this page and corrupts the command.)
- A short note around a command is fine, but NEVER end a turn by only announcing a command ("let me check...", "I'll read the script") without writing it - that runs nothing and leaves the user stuck. Either write the command now, or give your final answer.
- Final answers: plain text only, no Markdown or code fences. Do ONLY what was asked - fewest commands, no unrequested double-checks. When the task is done or the user is satisfied ("thanks", "perfect"...), reply ONE short sentence and STOP.
- Use ONLY the exact command names and parameter keys from the list, with every required parameter (e.g. multi_edit needs "datamodel_type": "Edit"; "... is required" means you omitted one). Do NOT use ${siteName}'s own features (web search, connectors...) unless the user explicitly asks.
- execute_luau: wrap code in BOTH markers ###LUA### ... ###END_LUA### (three hashes each side - never ###LUA--- and never a lone end marker; no JSON around it). Bare ###LUA### targets "Edit" and only works when Studio is NOT playing. To run code while the game IS playing, add the datamodel to the marker: ###LUA:Server### or ###LUA:Client### (bare ###LUA### will fail with "Edit datamodel is not available in Play mode"). Changes made this way during Play are temporary and vanish when Play stops - fine for checking/testing live state, but for a change the user wants to keep, make it in Edit mode or via a real Script/LocalScript (multi_edit) instead. Use \`return\` for output (print is NOT captured). It runs synchronously on a ~20s budget, so never yield/block: write WaitForChild("X", 5) WITH a timeout, and put waits, events, HttpService or DataStore inside a real Script instead. (Per-command tips are in the list_commands output.)
- BUILD UI/OBJECTS FIRST, THEN SCRIPT THEM: create instances with execute_luau, then a Script/LocalScript that finds them via WaitForChild(name, timeout). Use runtime Instance.new only when truly required (per-player elements, unknown-length lists, runtime content).
- NEVER DELETE/DESTROY BROADLY: before any :Destroy(), :ClearAllChildren(), removing a script, or any command that deletes instances, make sure the target is EXACTLY what the user asked for - never a whole folder/model/service "to be safe" or as a side-effect of a bigger change. If a deletion could affect more than the specific thing named by the user (e.g. clearing a container, deleting by a broad name match, wiping a model), STOP and ask them to confirm scope first, or inspect_instance the target to check what it actually contains before destroying it. Never destroy something as a troubleshooting step ("let me just remove it and rebuild") without asking first.
- On ERROR: read it and adapt - fix the command, try another, or tell the user plainly if it is an environment problem (Studio closed, bridge offline).
- On a property/attribute/value error (e.g. "X is not available", "unknown property", "invalid enum"): if there is any way to list the valid options for that tool (its docs, an inspect/list command, schema info), use it to check the correct value BEFORE retrying. Never guess blindly a second time.
- AUTO-RETRY (at most once): when an ERROR points at a specific, recoverable mistake in your OWN command - a typo'd property or method name, a missing WaitForChild timeout, a wrong datamodel marker (###LUA### vs ###LUA:Server###), or an invalid enum/argument - fix it and retry ONCE immediately, with no apology or commentary. If that retry fails again with the same error, STOP: do not loop the same guess. Check the docs/list output for the right value, or tell the user plainly what is blocking. Never send the same failing command three times.

━━━ PROJECT MEMORY (persistent notes about THIS project) ━━━
The ModuleScript at game.ServerStorage.VoidScript.Memory is your long-term memory for this project, saved inside the place. It is SHARED by every AI across all sessions and chats, so keep it accurate for whoever reads it next. Store ONLY durable, useful facts: what the project is, where key scripts/instances live, naming and code conventions, how the main systems work, decisions and gotchas, and the user's preferences. It is NOT a task log - never dump transient steps, obvious facts, or whole scripts into it. Keep it short.

- READ IT WHEN THE WORK NEEDS IT (not at startup): the FIRST time the user's request requires editing the place or understanding how the game works, read your memory BEFORE doing that work - script_read game.ServerStorage.VoidScript.Memory. Skip it for pure chit-chat or questions unrelated to the project. If it does not exist yet, create it with multi_edit (className "ModuleScript", first edit with old_string "") using exactly this skeleton (multi_edit auto-creates the VoidScript folder):
${BT}
return [==[
# Project memory
## Overview
## Where things live
## Conventions
## Key systems
## Decisions & gotchas
## User preferences
## Open questions / TODO
]==]
${BT}
- KEEP IT UPDATED: whenever you learn something lasting, edit the right section with multi_edit (script_read it first so your old_string matches exactly; the section headers make good anchors). Remove facts that became wrong. Store only what will help you next time - skip everything else.
- IF SOMETHING CONTRADICTS THE MEMORY: do NOT blindly trust either side. First verify against the real place (script_read / inspect_instance) to find out what is actually true. Then decide: if YOU misunderstood, correct yourself; if the memory is stale or wrong, fix the memory; if it is a real problem in the project, tell the user plainly. Always leave the memory consistent with reality.
- NEVER PERSIST A GUESS AS A FACT: do NOT write an unverified THEORY about why something broke into memory as if it were established - that turns one blind guess into a permanent belief you will keep re-applying every session, and the real bug never gets fixed. Store only what you actually verified. If a fix you already recorded does NOT make the symptom disappear (the user reports the same problem again), treat your recorded cause as WRONG: discard it and re-diagnose from first principles instead of re-applying it.

━━━ VOIDSCRIPT VIRTUAL COMMANDS & AUTO-VERIFY ━━━
Two things the extension adds on top of the MCP command list (they are NOT shown by list_commands, but they exist):
- \`revert_last\`: undoes your most recent edit to an EXISTING script. Every multi_edit on an existing script is automatically snapshotted first, so this restores the earlier source exactly. Use it whenever an edit you made turned out wrong - call it instead of trying to patch the damage by hand.
- \`revert_session\`: reverts EVERYTHING this session edited - restores every existing script it touched back to the state it was in when the session started. Use it when the whole session went off the rails and you want a clean slate to start again from (not just one edit).
- \`playtest\` / \`stop_playtest\`: enter/leave play mode for testing a game. After \`playtest\`, drive the simulated player with user_keyboard_input / user_mouse_input and observe the result (a screenshot is attached after every input). Always end with \`stop_playtest\`.
- \`export_snapshot\`: downloads a JSON snapshot of this session's tracked script edits (paths + pre-edit sources) via the browser. Use it when the user wants a portable record or manual-undo copy of what this session changed.
- \`command_palette\`: lists every VoidScript virtual command with a one-line description - call it if you forget what extension-level orchestration exists.
- \`plan_build\`: before a risky or large build, write your step-by-step plan in your reply, then call this to PAUSE the loop so the user can review the plan first. They press Resume to approve (Stop cancels); when resumed, build exactly as planned.
- \`keep_going\`: after a run of errors, call this to clear the error tally and keep working - it tells VoidScript you are intentionally continuing past the failures.
- AUTO-VERIFY: after every successful execute_luau / multi_edit / generate_* command, VoidScript may capture a screenshot of Roblox Studio and attach it to the result message so you can visually CONFIRM your change looks right. When that image is present, actually look at it and fix anything wrong before continuing - do not just assume the text result means the change is correct.

━━━ ROBLOX CODING CONVENTIONS (Luau, not generic Lua) ━━━
ALL code written for the user's Roblox project MUST be Roblox's Luau dialect, NEVER generic Lua. Follow the Luau syntax rules - typed parameters (: number, : string, etc.), string interpolation (string.format or backtick templates), built-in globals (task, Instance.new, math, table, etc.) and the Roblox API - NOT generic-Lua idioms. Roblox-specific differences matter: \`typeof()\` instead of Lua's \`type()\`, \`wait()\` is deprecated (use task.wait), \`Instance.new\` + properties instead of Lua tables for objects, \`Connect\` instead of \`callback\`. For ANY authoritative API detail - a class, property, enum, function, event, or service (Instance, Humanoid, RunService, RemoteEvent, ClassName rules, property types, enum values) - treat https://create.roblox.com/docs/reference/engine as the source of truth and match its exact signatures; never invent a property or behavior from memory. When a property or method name comes back wrong from Studio, check that reference before retrying. Prefer modern Luau features (type annotations, task library, string interpolation) over legacy Lua patterns, and keep all scripts server-authoritative unless the task explicitly needs a LocalScript.

━━━ ROBLOX 3D COORDINATES & ORIENTATION (mapping guidance) ━━━
Roblox uses a LEFT-HANDED Y-UP coordinate system. Learn this ONCE and never
confuse it with the right-handed / Z-up conventions from other engines or
Blender (where the model ends up UPSIDE DOWN or on its SIDE):
- Y axis = UP. A part that should sit ON the ground gets its bottom face at the
  target Y; "raise it up" means INCREASE Y, never Z. "Down" = negative Y.
- X = right, Y = up, Z = forward (when looking down +Z, +X is to the LEFT - mind
  this left-handed flip: turning "right" rotates around Y toward +X, and
  "forward" is +Z, not -Z).
- Part.Size = Vector3.new(WIDTH, HEIGHT, DEPTH) - X=width, Y=height, Z=depth.
  An elevator car that is taller than it is wide needs a LARGER .Y, not .Z.
- Orientation / Rotation on a part are EULER angles in DEGREES as Vector3.new,
  applied as Z-Y-X (roll-pitch-yaw) intrinsic order. A part's "facing" is its +Z.
  To make something FACE +Z (north/forward), leave Orientation at 0,0,0.
- NEVER guess rotation signs: if an object looks upside-down / backwards / on
  its side, it is an axis/orientation mapping mistake, NOT a position bug.
  Inspect, then fix the Orientation/CFrame, not the Position.
CFrame guidance:
- CFrame.new(x, y, z) = POSITION. CFrame.Angles(rx, ry, rz) = ROTATION in RADIANS,
  applied Z-Y-X order. CFrame.new(pos) * CFrame.Angles(rx, ry, rz) positions then
  rotates. To FACE +Z (forward), the look vector must be (0,0,1) - that is the
  default; do not negate it.
- Building direction-relative motion (elevators, doors, vehicles): prefer moving
  along the axis the mechanism needs, and use CFrame.lookAt when you need a part
  to point between two positions. The most common "upside down" bug is rotating
  around the wrong axis or using -Y where +Y was needed.
Quick self-check for any "looks wrong" build: after placing/orienting a part, run
\`inspect_instance Workspace.Part\` and verify BOTH Position.Y (height) and
Orientation (which way it faces / leans). If the model built a box that is a
floor instead of a wall, the Height (Y) was put on the wrong axis; if it is
facing the wrong way, the Y-rotation is flipped.

━━━ YOU CAN ACT DIRECTLY IN THE USER'S PROJECT ━━━

━━━ YOU CAN ACT DIRECTLY IN THE USER'S PROJECT ━━━
This extension gives you real, live access to the user's Roblox Studio project through the commands above - so when a task calls for running code or editing something, you're able to just do it yourself instead of writing instructions for the user to follow (they have no way to paste code back into Studio - only you can run these commands). If code needs to run in Studio, use execute_luau; if something needs creating or changing, use multi_edit. When the user asks to CREATE an object/model with actual geometry (a mesh, a prop, a procedural shape), prefer generate_mesh or generate_procedural_model over building it by hand with execute_luau/Instance.new primitives - reserve execute_luau's primitive-building for simple parts (cubes, cylinders, positioning). Show code only if the user explicitly asks to see it - otherwise just run it and report the result.

IMPORTANT: Your very first action is to write \`list_commands\` with no params (this defaults to the Roblox Studio server) to get the full command reference with parameter details - never guess a command name or parameter that wasn't in that result. Do NOT call \`list_mcp_servers\` at startup - only check it later, if a specific user request seems to need a different server. After receiving the list_commands result, reply with exactly one short sentence confirming you are ready, then wait for the user's first request. (Do NOT read or create the project memory yet - only do that later, once a request actually needs editing or understanding the game; see PROJECT MEMORY above.) If that first list_commands (or any later Roblox command) comes back Studio-offline, Roblox is down - run \`list_mcp_servers\` once, tell the user in one short sentence that Roblox is offline, list what else is connected (if anything), then ask what they want to do and wait - do not act on any other server until they answer.`;

    // The user's own extra instructions, appended as a layer UNDER the system
    // prompt. Optional - empty by default. It cannot change the rules above.
    const prefLine = preferredModel
      ? `\n\n━━━ PREFERRED MODEL ━━━\nThe user has set their preferred model on this site to: "${preferredModel}". Do not ask them to switch models - work within it, and if something behaves unexpectedly for this model, adapt your approach.`
      : "";
    const extra = customPrompt.trim()
      ? `\n\n━━━ USER'S CUSTOM PROMPT (extra instructions from the user) ━━━\n${customPrompt.trim()}`
      : "";

    // The marker leads the prompt; it tags the bootstrap turn for camouflage.
    return `${SYS_MARKER}\n${prompt}${extra}${prefLine}${genreExtra(opts.projectType)}`;
  }

  // ── Genre-aware best practices (Feature: auto prompt-engineering) ─────────
  // A curated, Roblox-specific checklist per project genre, injected after the
  // user's custom prompt so the model follows the right conventions. Kept tight
  // - it only appears when the user has selected a genre, so no one pays the
  // context cost for an irrelevant genre. The genre comes from the stored
  // `vsProjectType` setting (menu picker); "" (or unknown) adds nothing.
  const PROJECT_TYPES = {
    obby: "Target genre: OBSTACLE COURSE. Checkpoints with respawn teleports, jump-accurate part sizes/spacing, a kill/fall detector that resets the player to the last checkpoint, and a finish line. Keep part counts low for mobile performance.",
    shooter: "Target genre: SHOOTER. Decide hitscan vs projectile, add ammo + reload, score/damage balancing, team handling if multiplayer, respawn points, and (for projectiles) NetworkOwnership so physics work server-authoritatively. Use a local vision/auto-fire tool rather than a grouped one.",
    tycoon: "Target genre: TYCOON. Use a per-player MoneyDropper (clone a template Folder via SpawnFunction owned by each Player) feeding leaderstats.Coins, a MoneyRounder for readable totals, and purchasable upgrades/rebirths. Caution: ReplicatedFirst can create cleanliness issues with instance parents.",
    survival: "Target genre: SURVIVAL/ZOMBIE. Enemy wave system with a server spawner, NPCs that damage the player's humanoid, player health + respawn, and rewarded kills. Use DamageService-free simple damage (take damage on Humanoid) and cap entity counts.",
    racing: "Target genre: RACING/VEHICLE. Use VehicleSeats with proper suspension, add a flip/reset keybind, track checkpoints with lap timers, and ensure vehicle canNetwork for the driver.",
    simulator: "Target genre: SIMULATOR. Click-to-collect drops, Rebirth/multiplier progression, per-player value storage (leaderstats + serialized tables), and idle earnings. Keep save-data schema versioned for migrations.",
    tower: "Target genre: TOWER DEFENSE. A base with lives, a wave spawner that walks enemies along pre-placed Waypoint parts (MoveTo, NOT PathfindingService per enemy), towers that auto-target the nearest enemy in range, and money per kill to buy/upgrade towers.",
    rpg: "Target genre: RPG. An NPC with a quest, XP + levels in leaderstats, a small inventory (ModuleScript + client UI), and one simple combat loop. Keep it to a single quest chain and versioned save-data.",
    farming: "Target genre: FARMING. Tillable plots players plant seeds into, crops that grow over time (server-side timer), harvest to an inventory, selling for money, and a shop UI. Persist plot state per player.",
    escape: "Target genre: ESCAPE ROOM / PUZZLE. A series of puzzles where solving one unlocks the next (keys, codes, levers), item pickups with an inventory, and an escape goal with a timer. Server-authoritative puzzle state; RemoteEvents carry inputs only.",
    horror: "Target genre: HORROR SURVIVAL. A dark map, a monster NPC that chases players (server-controlled with a check-cooldown chase), a stamina bar, hiding spots, and jump-scare moments. Cap entity counts and keep the AI cheap.",
    sports: "Target genre: SPORTS GAME. One core match loop (kick/throw/hit a ball into a goal), player vs player or vs simple AI, score tracking with match reset, and clean ball physics with a canLocal handoff for the active player.",
    sandbox: "Target genre: SANDBOX / CREATIVE. Free-form building tools players use to place/rotate/color parts (server-authoritative placement with ownership), a simple toolbar UI, and an undo last action. Keep the tool API small and lag-free.",
    life: "Target genre: LIFE SIM / CITY. A town with enterable buildings, an NPC shopkeeper that trades currency, a day cycle, and one career/progression loop (money, inventory, a goal to buy). Server-authoritative economy.",
    battle_royale: "Target genre: BATTLE ROYALE. A shrinking safe zone (scripted boundary that damages outside it), loot spawns, player elimination + respawn queue, and a last-one-standing win check. Minimize per-frame remotes.",
    crafting: "Target genre: CRAFTING / GATHERING. Resources that respawn in the world, a pick-up to a bag with capacity, a recipe list players craft at a station, and tools (axe/pickaxe) with durability. Versioned save-data for the inventory.",
    default: "Build clean, performant, server-authoritative Lua: use WaitForChild with timeouts, avoid per-frame remote events, prefer GetService once, and keep scripts organized (client/server separation).",
  };
  function genreExtra(projectType) {
    if (!projectType || !PROJECT_TYPES[projectType]) return "";
    return `\n\n━━━ TARGET PROJECT GENRE ━━━\nThe user selected this genre for the project. Follow these Roblox conventions too:\n${PROJECT_TYPES[projectType]}`;
  }

  // ── Addon MCP templates (Feature: multi-app story) ─────────────────────────
  // One-click starter commands for driving OTHER apps alongside Roblox Studio.
  // Each entry fills the "add server" form in the menu; the host app usually
  // also needs its own plugin/bridge running (see the note). Command strings
  // are stdio/CLI form because the bridge launches them as subprocesses.
  // `variants` offers the same server through BOTH runtimes where both exist:
  //   npx → the JS/npm ecosystem (Node 18+),  uvx → the Python ecosystem (uv).
  // The menu lets the user pick a runtime and fills the command accordingly.
  const MCP_TEMPLATES = {
    blender: {
      name: "Blender",
      variants: { npx: "npx -y blender-mcp", uvx: "uvx blender-mcp" },
      note: "Drives Blender (model/mesh work, materials, scenes). First install the blender-mcp addon inside Blender (Edit > Preferences > Add-ons > Install from Disk: the blender_mcp_addon folder that ships with the server) and keep Blender open; the server talks to it over a local socket.",
    },
    figma: {
      name: "Figma (design)",
      variants: { npx: "npx -y figma-developer-mcp --figma-api-key=YOUR_KEY --stdio" },
      note: "Reads/writes Figma frames so the agent can follow a design. Replace YOUR_KEY with a Figma personal access token (Figma > Settings > Security). The official Figma MCP requires the key either here or in FIGMA_API_KEY.",
    },
    unreal: {
      name: "Unreal Engine",
      variants: { npx: "npx -y unreal-engine-mcp-server" },
      note: "Drives the Unreal editor through its C++ bridge plugin (install the plugin in the project first). The server reads UE_PROJECT_PATH to find your .uproject - set it in bridge config.json (env) or the shell before starting, e.g. UE_PROJECT_PATH=C:/Path/To/MyGame.",
    },
    godot: {
      name: "Godot",
      variants: { npx: "npx -y godot-mcp-server" },
      note: "Connects a running Godot project. First install the godot_mcp addon in the project (AssetLib > search 'Godot MCP' > Install) and enable it under Project > Project Settings > Plugins. No key needed.",
    },
    sketchfab: {
      name: "Sketchfab (3D assets)",
      variants: { uvx: "uvx sketchfab-mcp" },
      note: "Searches/downloads 3D models from Sketchfab so the agent can grab real assets instead of building everything by hand. Needs SKETCHFAB_API_TOKEN set (Sketchfab > Settings > Security). Python/uv only (uvx).",
    },
    aseprite: {
      name: "Aseprite (2D art)",
      variants: { uvx: "uvx aseprite-mcp" },
      note: "Creates/edits Aseprite sprites (pixel art, UI icons, textures). Aseprite must be installed and its CLI on PATH; the server drives it through Aseprite's scripting API. Python/uv only (uvx).",
    },
    filesystem: {
      name: "Filesystem (local files)",
      variants: {
        npx: "npx -y @modelcontextprotocol/server-filesystem C:/Path/To/Assets",
        uvx: "uvx mcp-server-filesystem C:/Path/To/Assets",
      },
      note: "Lets the agent read/write real files in ONE folder you choose (e.g. C:/Users/You/Documents/RobloxBuilds) - handy for saving scripts, configs, or meshes next to your project. Change the C:/Path/To/Assets argument to your folder before adding.",
    },
    fetch: {
      name: "Fetch (web pages)",
      variants: {
        npx: "npx -y @modelcontextprotocol/server-fetch",
        uvx: "uvx mcp-server-fetch",
      },
      note: "Lets the agent fetch a URL and read web content - great for looking up Roblox API docs (create.roblox.com/docs/reference/engine) or tutorials mid-build. No setup.",
    },
    memory: {
      name: "Memory (knowledge graph)",
      variants: {
        npx: "npx -y @modelcontextprotocol/server-memory",
        uvx: "uvx mcp-server-memory",
      },
      note: "A persistent entity-relation memory the agent can write project notes to across sessions - an extra layer on top of the in-place VoidScript.Memory module. No setup.",
    },
    "sequential-thinking": {
      name: "Sequential thinking",
      variants: {
        npx: "npx -y @modelcontextprotocol/server-sequential-thinking",
        uvx: "uvx mcp-server-sequential-thinking",
      },
      note: "A structured reasoning scratchpad tool that helps the agent think through complex builds step by step. No setup.",
    },
    time: {
      name: "Time (clock/date)",
      variants: {
        npx: "npx -y @modelcontextprotocol/server-time",
        uvx: "uvx mcp-server-time",
      },
      note: "Gives the agent the current date/time in any timezone - useful for deadlines or time-based game features. No setup.",
    },
    sqlite: {
      name: "SQLite (local database)",
      variants: {
        npx: "npx -y @modelcontextprotocol/server-sqlite --db C:/Path/To/place.db",
        uvx: "uvx mcp-server-sqlite --db C:/Path/To/place.db",
      },
      note: "A local SQL database for player saves, configs, or analytics that outlive a Roblox place. Change the --db path to the file you want before adding.",
    },
    github: {
      name: "GitHub",
      variants: { uvx: "uvx github-mcp-server --personal-access-token=YOUR_TOKEN" },
      note: "Lets the agent browse repos, issues, and files on GitHub. Replace YOUR_TOKEN with a GitHub Personal Access Token (github.com > Settings > Developer settings > Personal access tokens). Also available as a Docker image. Python/uv only (uvx).",
    },
    playwright: {
      name: "Playwright (browser)",
      variants: { npx: "npx @playwright/mcp@latest" },
      note: "Drives a real headless browser - the agent can load a web page, click, and read the result. Great for testing web versions of your game or scraping docs. Node/npm only (npx).",
    },
    puppeteer: {
      name: "Puppeteer (browser)",
      variants: { npx: "npx -y @modelcontextprotocol/server-puppeteer" },
      note: "Alternative headless-browser automation (Chrome). Same idea as Playwright but via the reference Puppeteer server. Node/npm only (npx).",
    },
    everything: {
      name: "Everything (test server)",
      variants: {
        npx: "npx -y @modelcontextprotocol/server-everything",
        uvx: "uvx mcp-server-everything",
      },
      note: "The MCP reference test server - exposes every tool type so the agent (or you) can sanity-check that addon MCP plumbing works. No setup.",
    },
    "brave-search": {
      name: "Brave search (web)",
      variants: { npx: "npx -y @modelcontextprotocol/server-brave-search" },
      note: "Lets the agent search the web through Brave. Requires a free Brave Search API key (brave.com/search/api) set as BRAVE_API_KEY in bridge config.json (env) or the shell. Node/npm only (npx).",
    },
    slack: {
      name: "Slack (team chat)",
      variants: { npx: "npx -y @modelcontextprotocol/server-slack" },
      note: "Reads/writes Slack channels so the agent can post progress or read feedback. Needs a Slack Bot User OAuth token (SLACK_BOT_TOKEN) plus a team ID (SLACK_TEAM_ID) set in bridge config.json (env). Node/npm only (npx).",
    },
    postgres: {
      name: "PostgreSQL (database)",
      variants: { npx: "npx -y @modelcontextprotocol/server-postgres postgres://user:pass@localhost:5432/db" },
      note: "Lets the agent query/manage a PostgreSQL database - good for server-side player data beyond Roblox. Replace the postgres://... connection string with your own before adding. Node/npm only (npx).",
    },
    notion: {
      name: "Notion (docs)",
      variants: { npx: "npx -y @makenotion/notion-mcp-server" },
      note: "Reads/writes Notion pages and databases - handy for keeping a build log or design doc outside Roblox. Replace the NOTION_TOKEN in bridge config.json (env) with your integration token. Node/npm only (npx).",
    },
    "youtube-transcript": {
      name: "YouTube transcripts",
      variants: { npx: "npx -y youtube-transcript-mcp" },
      note: "Fetches YouTube video transcripts so the agent can reference tutorial videos by URL. No setup - it scrapes the public transcript. Node/npm only (npx).",
    },
    "spotify": {
      name: "Spotify (music)",
      variants: { npx: "npx -y @modelcontextprotocol/server-spotify" },
      note: "Lets the agent read playlists and control Spotify playback - good for games with dynamic music. Needs a Spotify developer app client ID/secret (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET) set in bridge config.json (env). Node/npm only (npx).",
    },
    "git": {
      name: "Git (version control)",
      variants: { npx: "npx -y @modelcontextprotocol/server-git" },
      note: "Lets the agent run git operations (commit, branch, diff) on your local repo. Set GIT_REPOSITORY_PATH in bridge config.json (env) to your project folder. Node/npm only (npx).",
    },
    "docker": {
      name: "Docker",
      variants: { npx: "npx -y @modelcontextprotocol/server-docker" },
      note: "Lets the agent manage Docker containers - useful for running local services (databases, APIs) alongside Roblox. Needs Docker running. Node/npm only (npx).",
    },
    "postgres": {
      name: "PostgreSQL (database)",
      variants: { npx: "npx -y @modelcontextprotocol/server-postgres postgres://user:pass@localhost:5432/db" },
      note: "Lets the agent query/manage a PostgreSQL database - good for server-side player data beyond Roblox. Replace the postgres://... connection string with your own before adding. Node/npm only (npx).",
    },
    "redis": {
      name: "Redis (cache/datastore)",
      variants: { npx: "npx -y @modelcontextprotocol/server-redis redis://localhost:6379" },
      note: "A fast key-value store the agent can use for real-time state (leaderboards, matchmaking pools, pub/sub). Set REDIS_URL in bridge config.json (env) if not localhost:6379. Node/npm only (npx).",
    },
    "google-drive": {
      name: "Google Drive",
      variants: { npx: "npx -y @modelcontextprotocol/server-google-drive" },
      note: "Reads/writes Google Drive docs - handy for pulling in game design docs or asset lists. Needs GOOGLE_DRIVE_AUTH or OAuth credentials. Node/npm only (npx).",
    },
    "calendar": {
      name: "Google Calendar",
      variants: { npx: "npx -y @modelcontextprotocol/server-calendar" },
      note: "Lets the agent check your calendar and schedule events - useful for content drops or playtests. Needs GCP credentials. Node/npm only (npx).",
    },
    "imap": {
      name: "Email (IMAP)",
      variants: { npx: "npx -y @modelcontextprotocol/server-imap" },
      note: "Lets the agent read/send email - good for automating build reports. Needs IMAP credentials (IMAP_HOST, IMAP_USER, IMAP_PASS) in bridge config.json (env). Node/npm only (npx).",
    },
  };

  // ── uvx setup guide (Feature: Python MCP servers) ─────────────────────────
  // Many MCP servers (Blender, Sketchfab, Aseprite, the reference servers) are
  // Python packages launched with `uvx` from the uv tool. This guide is shown in
  // the menu when the user picks the uvx runtime, so adding a Python server is
  // copy-free even on a fresh machine.
  const UVX_SETUP = [
    "uvx comes from the uv tool (a single exe, no separate Python install needed). Install it one of these ways:",
    "  1) PowerShell (easiest):  powershell -ExecutionPolicy ByPass -c \"irm https://astral.sh/uv/install.ps1 | iex\"",
    "  2) Windows Store:         winget install astral-sh.uv",
    "  3) pip:                   pip install uv",
    "Then CLOSE and reopen the terminal (or quit start.bat and run it again) so PATH refreshes, and check it works with:  uvx --version",
    "uvx downloads each Python tool on first run, so the FIRST launch needs internet and can take a minute.",
    "If the bridge says the server couldn't start: run start.bat from the same terminal where uv works, or add the uv install folder to PATH (usually %USERPROFILE%\\.local\\bin on Windows).",
  ].join("\n");

  // ── Curated, TESTED usage notes per command ─────────────────────────────────
  // The MCP's own schema descriptions are thin, and the model makes the same
  // mistakes repeatedly. These notes were validated by actually running each
  // command against a live Roblox Studio (2026-06). Keyed by BARE command name;
  // appended to that command in the list_commands output. Keep each note tight
  // and concrete - it costs context on every reminder.
  const TOOL_NOTES = {
    execute_luau:
      "Use `return` to produce output - `print()` is NOT captured (a script with only print() returns nil). " +
      "Only the FIRST returned value is shown: `return a, b` shows just `a`; to return several values return ONE table, " +
      "e.g. `return {ok=true, n=3}` (tables come back as JSON). " +
      "Runs synchronously with a ~20s budget: a brief `task.wait(1)` is fine, but anything that can block or never resolve will TIME OUT. " +
      "ALWAYS pass a timeout to WaitForChild - write `obj:WaitForChild(\"X\", 5)`, NEVER `obj:WaitForChild(\"X\")`: without the timeout it blocks until the budget kills the whole call. " +
      "Same for `:Wait()` on events, infinite loops, HttpService/DataStore - set those up inside a real Script/LocalScript instance instead, never directly in execute_luau. " +
      "Property types must match exactly (e.g. Position needs Vector3.new(...), not a string). " +
      "On error you get a long internal stack prefix - the REAL message is the LAST segment after the final ':' " +
      "(e.g. '... : Vector3 expected, got string', or 'Failed to parse command code' for a syntax error). " +
      "Create objects with Instance.new and set .Parent; reach services via game:GetService(\"Name\"). " +
      "MAPPING: Roblox is Y-UP and left-handed (X=right, Y=up, Z=forward). An object that looks upside-down, on its side, or facing backwards is an ORIENTATION mistake, not a position mistake - fix Orientation/CFrame.Angles (in RADIANS, applied Z-Y-X = roll-pitch-yaw) or Part.Size (X=width, Y=height, Z=depth), never the Position. If an elevator/ramp/door moves along the wrong axis, it was moved on Y when it should be on Z, or vice versa. Verify both Position.Y (height) and Orientation with inspect_instance after placing anything directional.",
    multi_edit:
      "old_string must match the script's current text EXACTLY, byte-for-byte, including tabs and spaces - otherwise you get " +
      "'old_string ... not found in current content'. ALWAYS script_read the file FIRST and copy the exact text. " +
      "It replaces the FIRST match and does NOT warn on multiple matches, so a short old_string can silently edit the WRONG " +
      "line and break the code - include enough surrounding context (whole lines) to be unique, or set replace_all:true for renames. " +
      "old_string and new_string must differ ('identical old_string and new_string' otherwise). " +
      "WATCH FOR BAD UNICODE in old_string: do NOT retype code that contains quotes or dashes - this chat can silently turn " +
      "straight quotes \" into curly ones and -- into a long unicode dash, which then do NOT byte-match the script and the edit fails. " +
      "Paste old_string verbatim from script_read. (new_string may contain unicode safely - it is written as-is.) " +
      "Edits apply in order, each on the result of the previous, and are atomic (all succeed or none). " +
      "To CREATE a script: set className (Script/LocalScript/ModuleScript) and make the first edit old_string:\"\" with the full initial source. " +
      "datamodel_type must be \"Edit\".",
    inspect_instance:
      "Path is dot-notation and case-insensitive, e.g. 'Workspace.Model.Part'. Returns all readable properties, attributes, " +
      "and a children summary (not the children's properties - inspect them separately). If several instances share the path, " +
      "up to 20 matches are returned. Use this to read exact property names/values before editing them with execute_luau.",
    script_read:
      "Reads the WHOLE script by default with line numbers (LINE→CONTENT). Use it before multi_edit so your old_string " +
      "matches exactly. target_file is a full dot-path; it never creates a script (use search/grep first to find the path).",
    user_keyboard_input:
      "Simulates a real player typing during PLAY. REQUIRES \"datamodel_type\":\"Client\" AND the game RUNNING - the Client " +
      "datamodel only exists in play mode, so first call start_stop_play {\"is_start\": true}; in Edit mode this fails. " +
      "(VoidScript auto-fills datamodel_type:\"Client\" if you omit it, but the game must still be running.) " +
      "\"actions\" is an ORDERED array of OBJECTS - each step MUST be {\"action\": ...}, NOT a bare string (a missing/misnamed action " +
      "gives 'Unknown ... action: nil'). action is one of: keyDown | keyUp | keyPress (down+up) | textInput | wait. " +
      "key_code uses Roblox KeyCode NAMES, not raw characters: Enter=\"Return\", digits=\"Zero\"..\"Nine\", letters=single uppercase " +
      "\"A\"..\"Z\", plus \"Space\", \"Backspace\", \"Tab\", arrows \"Up\"/\"Down\"/\"Left\"/\"Right\", modifiers \"LeftShift\"/\"LeftControl\"/\"LeftAlt\" " +
      "- REQUIRED on keyDown/keyUp/keyPress ('key_code is required' otherwise). To type a whole string use ONE textInput step with " +
      "\"text_inputs\":\"hello\" instead of many keyPress. A \"wait\" step MUST carry \"wait_time_ms\" (0-10000) ('wait_time_ms is required " +
      "for wait action' otherwise). Optional \"instance_path\" routes input to a focused GUI element and must start with game, LocalPlayer " +
      "or Workspace (e.g. \"LocalPlayer.PlayerGui.Menu.NameBox\"); omit it to send to whatever currently has focus. " +
      "Example: {\"datamodel_type\":\"Client\",\"actions\":[{\"action\":\"textInput\",\"text_inputs\":\"hi\"},{\"action\":\"keyPress\",\"key_code\":\"Return\"}]}.",
    generate_mesh:
      "Unlike generate_procedural_model, this call YIELDS: it blocks until the AI mesh generation finishes and only then " +
      "returns the result (the finished mesh) - there is no separate poll/wait step needed, just wait for the response.",
    generate_procedural_model:
      "Unlike generate_mesh, this call does NOT yield: it returns immediately with a generationId while the model builds " +
      "in the background and auto-inserts into the workspace once done - do NOT run other commands assuming the model already " +
      "exists yet. Do NOT call wait_job_finished as a reflex right after this - but DO call it (pass the generationId) whenever " +
      "you actually need the finished result before continuing: either the user explicitly asked to wait, or your next step " +
      "depends on the model being done (e.g. editing/coloring it, checking its geometry).",
    user_mouse_input:
      "Simulates real player mouse actions during PLAY. Same requirement as user_keyboard_input: \"datamodel_type\":\"Client\" (auto-filled " +
      "if omitted) AND the game RUNNING (start_stop_play {\"is_start\": true} first; fails in Edit mode). " +
      "\"actions\" is an ORDERED array of OBJECTS - each step MUST be {\"action\": ...}, NOT a bare string (a missing/misnamed action gives " +
      "'Unknown mouse action: nil'). action is one of: moveTo | mouseButtonDown | mouseButtonUp | mouseButtonClick | scrollUp | scrollDown | wait. " +
      "You MUST establish a position BEFORE any click/scroll: the FIRST step needs \"x\"/\"y\" (screen pixels) OR \"instance_path\" " +
      "(starts with game/LocalPlayer/Workspace; if set, x/y are ignored) - else 'Either x and y, instance_path, or a prior action ... is " +
      "required'. Later steps may omit x/y and reuse the last position (click then scroll at the same spot). " +
      "mouseButtonDown/Up/Click need \"mouse_button\":\"left\" or \"right\". A \"wait\" step needs \"wait_time_ms\" (0-10000). " +
      "Example: {\"datamodel_type\":\"Client\",\"actions\":[{\"action\":\"mouseButtonClick\",\"mouse_button\":\"left\",\"instance_path\":\"LocalPlayer.PlayerGui.Menu.PlayBtn\"}]}.",
    vs_make_animation:
      "This tool CREATES AND PLAYS the animation for you in one call - there is NO animation ID, NO 'AnimationId', NO asset " +
      "upload, and NO Animation instance to create afterwards. CRITICAL: never tell the user the animation needs a Roblox " +
      "asset ID, a catalog upload, or any ID to 'work' - it does NOT, and saying so is a mistake. The result starts with " +
      "'ANIMATION DONE' - treat that as full success and report it plainly; do NOT re-explain or second-guess it. " +
      "The tool registers the KeyframeSequence as an AnimationClip and plays it on the rig; if the clip API is blocked in " +
      "a running game it drives the rig's joints directly and still animates the live player - both outcomes are complete " +
      "and NOT failures. Do NOT try to 'finish' the animation by hand (building an Animation + AnimationId) after this " +
      "tool runs - that is already taken care of. Just pick a 'style' (idle/walk/run/sprint/jump/wave/" +
      "dance/punch/sword_slash/sit/crouch) or pass 'keyframes' JSON for full control, and read the tool's result to report what " +
      "played. The generated KeyframeSequence is also saved under ReplicatedStorage.VoidScriptAnimations as a reusable asset.",
    vs_make_vfx:
      "Creates the requested VFX as native Roblox instances and attaches it to the chosen part/position - fully complete after " +
      "one call, no asset or ID needed. Pick a built-in 'effect' (fire/smoke/explosion/lightning/sparks/glow/portal/shield/slash/" +
      "footsteps/rain/snow/lava/water_splash/muzzle_flash/electric_aura/hearts/starfield/sandstorm/sparkle_aura) or pass " +
      "'emitters' JSON to define particle/beam/light instances yourself. Read the tool's result to report exactly what was built " +
      "and where.",
  };

  // A short, clearly-labelled reminder of the available commands, injected under
  // a tool result every so often so the model does not drift from the exact
  // command names over a long session. It is explicitly framed as an automatic
  // VoidScript reminder (NOT a user message and NOT a new command to run).
  function toolsReminder(tools) {
    const toolsString =
      "  list_commands() - list all available Roblox Studio commands with full parameter details\n" +
      compactTools(tools);
    return (
      "\n\n────────────────────────────────\n" +
      "(System note from VoidScript - this is an automatic REMINDER, not a request and not a new result. " +
      "Do NOT reply to it or run any command because of it; just keep it in mind for your next command.)\n" +
      "Reminder of the Roblox Studio commands (use exact names and parameter keys; " +
      "for other connected apps call list_mcp_servers):\n" +
      toolsString
    );
  }

  // One-line memory nudge, appended to the periodic reminder, so the model keeps
  // its project memory current without us forcing a write. Clearly framed as an
  // optional reminder, NOT a command to run right now.
  function memoryNudge() {
    return (
      "(Reminder: if you've learned anything DURABLE about this project since your last memory update " +
      "(architecture, where things live, conventions, decisions, user preferences), update your shared project memory at " +
      "game.ServerStorage.VoidScript.Memory with multi_edit - only useful, lasting facts. If nothing changed, ignore this.)"
    );
  }

  // ── Provider stability notes (Feature) ─────────────────────────────────────
  // Curated observations about how reliably each AI site works WITH VoidScript,
  // shown in the menu so the user can pick a provider that matches how much
  // babysitting they want. These are community-field notes - treat them as
  // "tends to", not guarantees; the sites change their UI often.
  const PROVIDER_STABILITY = {
    gemini: { level: "excellent", note: "Very reliable for sessions - fast turn detection, no virtualization quirks. Best all-round choice." },
    chatgpt: { level: "good", note: "Solid. Session resume and stop work well; occasional longer reply delays." },
    claude: { level: "good", note: "Reliable tool calling and long builds. Watch for its answer-long stop button placement." },
    deepseek: { level: "good", note: "Great for long builds. Prefers Expert mode at startup; switch modes mid-chat is limited." },
    qwen: { level: "good", note: "Reliable. Uses a virtualized list, so long sessions may need a scroll-up nudge." },
    lmarena: { level: "good", note: "Wraps a rotating set of models; great for variety, less predictable for consistency." },
    glm: { level: "fair", note: "Works, but occasionally rate-limits long sessions. Has a virtualized list." },
    kimi: { level: "fair", note: "Fine for moderate builds. Longer sessions can slow with big tool results." },
    copilot: { level: "fair", note: "Can be captcha-prone under automation; keep trust high and watch the first turn." },
    grok: { level: "fair", note: "Good streaming but sometimes stops mid-turn without a clear Continue button." },
    perplexity: { level: "fair", note: "Works for shorter sessions; heavy tool loops can hit request limits." },
    meta: { level: "fair", note: "Occasional login-wall or rate-limit hiccups; fine otherwise." },
    blackbox: { level: "fair", note: "Good for quick jobs; less stable on very long builds." },
    poe: { level: "fair", note: "Multiple bots behind one tab; pick a coding bot and stick with it for a session." },
    "you": { level: "fair", note: "Streaming UI changes often; updates may briefly break turn detection." },
    arena: { level: "low", note: "Captcha can fire on the very first turn and block automation - the reason for the humanize-send toggle. Use when other providers are down." },
    chaton: { level: "low", note: "Occasional UI churn and rate limits; fine for short bursts." },
    t3chat: { level: "good", note: "Clean, fast chat UI with reliable streaming. Good for moderate Roblox builds on the generic adapter." },
    poolside: { level: "good", note: "Strong coding model; the generic adapter turns reliably. Report if the send handshake changes." },
    inflection: { level: "fair", note: "Polished consumer chat; selector-driven adapter only - verify turns are read if a session stalls." },
    hume: { level: "fair", note: "Voice/emotion-focused UI; the generic adapter handles its text chat. May need timing tuning on long turns." },
    twinny: { level: "fair", note: "Coding-oriented chat; runs on the generic adapter. Treat as beta until live DOM is validated." },
    cody: { level: "fair", note: "Sourcegraph's coding agent; the generic adapter handles its chat UI. May need timing tuning." },
    chatbase: { level: "fair", note: "Chatbot-builder chat UI; runs on the generic adapter. Verify send/turn detection live." },
    botstack: { level: "fair", note: "Multi-model chat platform; generic adapter only - early validation needed." },
    flowise: { level: "fair", note: "Open-source AI orchestration chat; generic adapter. Report if turns misread." },
    lobe: { level: "fair", note: "Microsoft's no-code AI app; the generic adapter handles its chat surface." },
  };
  function providerStability(id) {
    return PROVIDER_STABILITY[id] || null;
  }

  return {
    APP_NAME,
    SYS_MARKER,
    FEEDBACK,
    toolCategory,
    buildSystemPrompt,
    compactTools,
    toolsReminder,
    memoryNudge,
    TOOL_NOTES,
    PROJECT_TYPES,
    MCP_TEMPLATES,
    UVX_SETUP,
    PROVIDER_STABILITY,
    providerStability,
  };
})();
