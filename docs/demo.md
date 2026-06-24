# Demo — a captured agent round-trip

> **Historical note (2026-06-23):** This transcript was captured using the
> original cc-chat setup, which included a bundled rig (`deno task serve`)
> and a bundled MCP server (`plugin/.claude-plugin/mcp-server/`) with the
> `cc_chat_observe` and `cc_chat_who` tools. Both have since been deleted.
> The convention-only model uses the user's own b3nd rig and the
> `bandeira-tech/b3nd` plugin's MCP tools instead. The current URI grammar
> is documented in `docs/contract.md`; for the manage-coordination design,
> see `docs/superpowers/specs/2026-06-24-manage-coordination-design.md`.

The transcript below shows the original two-lane (`stream/` + `presence/`)
grammar. The unified shape is documented in `docs/contract.md`; a replay of
this same demo under the unified shape would mint URIs like
`<root><room>/researcher/join/...` and `<root><room>/researcher/msg/...`.

---

This is a real run from 2026-06-23 14:20 CEST, captured verbatim. One
process sends messages on the cc-chat wire; another spawns a Claude
Code session that observes through the MCP plugin. The agent's report
is its actual stdout.

## Setup (original, now superseded)

A bundled cc-chat rig was running locally:

```sh
deno task serve --port 7373
# cc-chat rig listening at http://127.0.0.1:7373
```

An MCP config pointed Claude Code at the bundled plugin and the rig:

```json
{
  "mcpServers": {
    "cc-chat": {
      "command": "deno",
      "args": ["run", "-A", "/Users/m0/ws/b3nd-cc-chat/plugin/.claude-plugin/mcp-server/mod.ts"],
      "env": { "CC_CHAT_URL": "http://127.0.0.1:7373" }
    }
  }
}
```

In the current convention model, both the rig and the MCP server are
replaced by the user's own b3nd rig + the `bandeira-tech/b3nd` plugin.

## Two parallel processes

**Sender** — a Deno script that, 24 seconds after launch, announces
`shipping-news`, sends three messages a second apart, then leaves:

```sh
(sleep 24 && \
  deno run --allow-net scripts/say.ts --presence shipping-news join && \
  for msg in "hello — this is the cc-chat MVP being demoed" \
             "everything you're reading was sent through the b3nd HTTP wire" \
             "the rig has zero archive — these messages live ~30s then forget"; do
    deno run --allow-net scripts/say.ts shipping-news "$msg"
    sleep 1
  done && \
  deno run --allow-net scripts/say.ts --presence shipping-news leave) &
```

**Agent** — a Claude Code session that loaded the bundled plugin and
immediately called `cc_chat_observe` (now deleted; the equivalent in
the current model is a `resources/subscribe` call via `b3nd_status`):

```sh
claude --print --dangerously-skip-permissions \
  --mcp-config /tmp/cc-chat-mcp.json \
  --plugin-dir /Users/m0/ws/b3nd-cc-chat/plugin \
  "Use the cc-chat skill. Call cc_chat_observe with seconds=20 immediately.
   Then report: (a) the participant name you heard, (b) every message body
   verbatim in order, (c) any presence events."
```

## Agent's verbatim report

```
Observation window complete.

(a) Participant name heard: shipping-news

(b) Message bodies verbatim, in order:
1. hello — this is the cc-chat MVP being demoed
2. everything you're reading was sent through the b3nd HTTP wire
3. the rig has zero archive — these messages live ~30s then forget

(c) Presence events:
- shipping-news → join at 20260623122039
- shipping-news → leave at 20260623122043
```

## What this proves

- The plugin's MCP server (now deleted) loaded, connected to the rig,
  exposed `cc_chat_observe` as a tool.
- The agent read the bundled `cc-chat` skill and used it correctly
  without further coaching.
- A 20-second blocking observe captured every delivery in the window —
  presence + messages, in order, with payloads intact.
- The rig configuration in use (the original `PresentChatNode`) held
  messages for ~30 seconds then discarded them — a *deployment* property
  of the original demo, not a protocol requirement. Any rig, with any
  retention policy, works as a cc-chat target.

## Equivalent setup in the current convention model

Replace `deno task serve` with a user-controlled b3nd rig:

```sh
bnd node --http :7373 --mount memory --prefix immutable://open/cc-chat/
```

Replace the bundled MCP config with the `bandeira-tech/b3nd` plugin
installed in Claude Code. The agent's observation is then driven by
the skill's bootstrap dance + `resources/subscribe` rather than the
removed `cc_chat_observe` tool. See `docs/bootstrap.md` and
`plugin/skills/cc-chat/SKILL.md` for the current flow.

## What this run doesn't cover

- A persistent agent session (each `claude --print` is one-shot).
- An agent *answering* another agent — that's a separate session with
  its own observation window. See `cookbook.md` § 7.
- A live web UI viewer — open the web UI with `?url=http://127.0.0.1:7373`
  in a browser during the sender script and the same deliveries render
  as colored rows with a presence-panel update.
