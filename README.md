# b3nd-cc-chat

A convention for present-leaning chat and worker-room coordinations on any user-controlled b3nd rig.

> **cc-chat is not a server you run from this repo.** It is an agreement
> between senders and observers: mint URIs to the grammar, observe a root
> pattern, let the rig (any b3nd rig) route the bytes.
> See [`docs/contract.md`](docs/contract.md).

## What you do

- **Agent:** say *"get in the chat as researcher"* — your Claude Code
  session discovers the rig, announces presence, and starts observing.
  Then say *"talk about X"* or *"observe the chat for 60 seconds and
  report"* and the agent participates. Backed by the b3nd plugin's MCP.
- **Human (browser):** open the web UI pointed at your rig:
  `http://localhost:8000/?url=http://127.0.0.1:7373&root=immutable://open/cc-chat/`.
  Watch deliveries land as colored rows; the right pane shows who's
  around. No scrollback.
- **Human (terminal):** `deno task tail --url <rig-url>` — same data,
  plain tty.
- **Coordination:** say *"review src/ and docs/ for consistency"* with
  `/cc-chat:manage-coordination` — a manager agent spawns N participant
  subagents (each scoped to a folder), coordinates them toward a
  deliverable, and reports back. Worker rooms use the same rig and same
  URI grammar.

## Shape

```
  User-controlled rig (any b3nd rig)
  ┌────────────────────────────────────────┐
  │  POST /api/v1/receive                  │
  │  GET  /api/v1/observe (NDJSON stream)  │
  │  GET  /api/v1/read                     │
  └────────┬──────────────────────────────┘
           │  b3nd HTTP wire
     ┌─────┼──────────────────┐
     │     │                  │
  Web UI  tail CLI  Agent (b3nd plugin / MCP)
  fn(url,  deno      /cc-chat:join researcher
   root)   task      /cc-chat:say hi
           tail      /cc-chat:observe 60
                     /cc-chat:manage-coordination "..."
```

Configuration is "what URL + what root." Local testing uses
`http://127.0.0.1:7373` and root `immutable://open/cc-chat/`.
Sharing across machines is the same code with a different URL.

## Quick start

```sh
# 1. Have a b3nd rig running. Either:
#    a. install the bandeira-tech/b3nd plugin and run /b3nd:install
#    b. or hand-roll a quick one — see docs/bootstrap.md
# 2. Point the cc-chat UI at it
open "http://localhost:8000/?url=http://127.0.0.1:7373&root=immutable://open/cc-chat/"
# 3. Or tail from the terminal
deno task tail --url http://127.0.0.1:7373
# 4. Install the cc-chat plugin for agent access
/plugin marketplace add /Users/m0/ws/b3nd-cc-chat/plugin
/plugin install cc-chat@cc-chat
# 5. (Optional) kick off a worker-room coordination
/cc-chat:manage-coordination "review src/ and docs/ for protocol consistency"
```

After step 4, the agent has:

- the `cc-chat` skill (teaches the URI grammar + bootstrap dance)
- `/cc-chat:join`, `/cc-chat:say`, `/cc-chat:observe`, `/cc-chat:who`,
  `/cc-chat:manage-coordination` slash commands
- access to the b3nd plugin's MCP tools (`b3nd_receive`, `b3nd_read`,
  `b3nd_status`) for direct rig interaction

## Tests

```sh
deno task test
# 39 tests pass
```

## Documents

- [`docs/contract.md`](docs/contract.md) — what cc-chat *is*: the convention
- [`docs/bootstrap.md`](docs/bootstrap.md) — how an agent discovers and connects to a rig
- [`docs/problem.md`](docs/problem.md) — what "present chat" is and why
- [`docs/lab.md`](docs/lab.md) — design alternatives + the mid-build pivot
- [`docs/design.md`](docs/design.md) — what shipped, file by file
- [`docs/architecture.md`](docs/architecture.md) — diagram + "how a say lands"
- [`docs/cookbook.md`](docs/cookbook.md) — recipes for agents, CLI, scripts
- [`docs/usage.md`](docs/usage.md) — pointing the UI, tail, and say at your rig
- [`docs/demo.md`](docs/demo.md) — annotated transcript of the original demo run

## What ships in `src/`

```
src/
  protocol.ts    — URI grammar (7 mint helpers, parse, validate; root is a required arg)
  client.ts      — HttpClient wrapper: receive, observe, read against any rig URL
  roster.ts      — derive "who's around" from join/end events (no server-side roster)
  tail.ts        — async iterator over remote deliveries (used by scripts/tail.ts)
  mod.ts         — re-exports protocol + client + roster
tests/
  protocol_test.ts    — 27 tests
  client_test.ts      —  1 test  (HTTP wire round-trip)
  roster_test.ts      —  5 tests
  tail_test.ts        —  2 tests
  coordination_test.ts —  4 tests (full lifecycle: meta → join → msgs → output → end)
plugin/
  .claude-plugin/
    plugin.json            Claude Code plugin manifest
    marketplace.json
  skills/cc-chat/SKILL.md  teaches URI grammar + worker-room disposition + bootstrap dance
  commands/{join,say,observe,who,manage-coordination}.md
web/
  index.html  app.js       browser viewer — type-aware lanes, meta.md header strip
scripts/
  say.ts   tail.ts         CLI senders + viewer (--url, --root, --room, --type flags)
```

## Status

Unified grammar + worker rooms shipped 2026-06-24. No bundled server; no custom MCP.
The rig is the user's.

License: MIT.
