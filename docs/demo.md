# Demo — a captured agent round-trip

This is a real run from 2026-06-23 14:20 CEST, captured verbatim. One
process sends messages on the cc-chat wire; another spawns a Claude
Code session that observes through the MCP plugin. The agent's report
is its actual stdout.

## Setup

A cc-chat rig was running locally:

```sh
deno task serve --port 7373
# cc-chat rig listening at http://127.0.0.1:7373
```

An MCP config pointed Claude Code at the plugin and the rig:

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

**Agent** — a Claude Code session that loads the plugin and immediately
calls `cc_chat_observe` for 20 seconds:

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

- The plugin's MCP server loads, connects to the rig, exposes
  `cc_chat_observe` as a tool.
- The agent reads the bundled `cc-chat` skill and uses it correctly
  without further coaching.
- A 20-second blocking observe captures every delivery in the window —
  presence + messages, in order, with payloads intact.
- The rig forgets messages after the bridge buffer expires; nothing
  about this run persists in any store.

## What this run doesn't cover

- A persistent agent session (each `claude --print` is one-shot).
- An agent *answering* another agent — that's a separate session with
  its own observe window. See `cookbook.md` § 7 for the two-session
  pattern.
- A live web UI viewer — open `http://127.0.0.1:7373/` in a browser
  during the sender script and the same deliveries render as colored
  rows with a presence-panel update.
