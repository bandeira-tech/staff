# Design

The picked design from `lab.md`, updated to reflect the convention-only
refactor. cc-chat contributes no rig.

## URI vocabulary

Under the operator-chosen root, two URI shapes are commitments:

```
<root>stream/<name>/<seq>      payload: utf-8 message text
<root>presence/<name>/<seq>    payload: "join" or "leave"
```

- `<name>` matches `[a-z0-9][a-z0-9-]{0,31}`.
- `<seq>` is `<YYYYMMDDhhmmss>-<6 base32 chars>` (UTC).
- The root is operator-supplied — cc-chat has no scheme of its own.
  `immutable://open/cc-chat/` is the suggested default.

See [`docs/contract.md`](contract.md) for the full grammar and protocol
guarantees.

## File layout

```
src/
  protocol.ts    — pure: URI parsing, name validation, builders (root is a required arg)
  client.ts      — HttpClient wrapper: receive, observe, read against any rig URL
  roster.ts      — derive "who's around" from an observe stream (no server-side roster)
  tail.ts        — async iterator over remote deliveries
  mod.ts         — re-exports protocol + client + roster
tests/
  protocol_test.ts   — URI shape, name validation (18 tests)
  client_test.ts     — HTTP wire round-trip (4 tests)
  roster_test.ts     — roster derivation (2 tests)
  tail_test.ts       — tail iterator (2 tests)
  e2e_claude_test.ts — env-gated e2e against a real bnd rig (1 test)
web/
  index.html     — static UI shell; reads ?url= and ?root= from query string
  app.js         — NDJSON observe + JSON read loop, DOM update, presence panel
plugin/
  .claude-plugin/
    plugin.json            Claude Code plugin manifest
    marketplace.json
  skills/cc-chat/SKILL.md  URI grammar + bootstrap dance for agents
  commands/
    join.md    say.md    observe.md    who.md
scripts/
  say.ts   tail.ts         CLI senders + viewer (accept --url, --root flags)
deno.json            tasks: test, tail, say
README.md
```

## cc-chat contributes no rig

The original design included `node.ts` (PresentChatNode), `rig.ts`
(wrapping the node in a b3nd Rig), and `serve.ts` (Deno HTTP listener).
All three are deleted. The rig is the user's — any b3nd-compatible rig
works. See [`docs/bootstrap.md`](bootstrap.md) for how to connect to one.

## Client API (`src/client.ts`)

```ts
class CcChatClient {
  constructor(opts: { url: string; root: string })
  receive(name: string, payload: string): Promise<void>
  announce(name: string, event: "join" | "leave"): Promise<void>
  observe(pattern?: string): AsyncIterable<{ uri: string; payload: string }>
}
```

Thin wrapper over `@bandeira-tech/b3nd-move`'s `HttpClient`. Agents use
the b3nd plugin's MCP tools directly; `CcChatClient` is for scripts,
tests, and the web UI's fetch calls.

## Roster (`src/roster.ts`)

```ts
function rosterFromObserve(
  stream: AsyncIterable<{ uri: string }>,
  root: string,
): AsyncIterable<Map<string, Date>>
```

Derives "who's around" by extracting the `<name>` segment from incoming
URIs. No server-side roster — the UI applies a warm→cold gradient from
observed traffic recency. Presence events (`presence/<name>/<seq>`) are
distinguished from stream messages (`stream/<name>/<seq>`).

## Protocol (`src/protocol.ts`)

```ts
mintStreamUri(root: string, name: string): string
mintPresenceUri(root: string, name: string): string
parseUri(root: string, uri: string): { kind: "stream" | "presence"; name: string; seq: string } | null
validateName(name: string): boolean
```

Root is always a required argument. No default root is baked into the
library. Callers pass the root they negotiated during bootstrap.

## Web UI

A single page, parameterised by `?url=` and `?root=`. No history, no
scrollback. Presence events render as grey one-liners (`researcher joined`);
messages render as `name: body`. When the NDJSON stream disconnects, the
page reconnects automatically. The presence panel in the right pane
derives "who's around" from traffic in the last 30 seconds of the live
stream — no server push.

The UI is intentionally text-first — closer to a tail-of-log than a chat
app. That is what *present* feels like.

## What today's tests cover

- `protocol_test.ts` — URI builders / parsers / validators (18 tests).
- `client_test.ts` — receive→observe fanout over the HTTP wire (4 tests).
- `roster_test.ts` — roster derivation from observe streams (2 tests).
- `tail_test.ts` — terminal tail iterator (2 tests).

The e2e test (`CC_CHAT_E2E=1`) drives a real `bnd node` process and
verifies the full round-trip. Task 10 captures a fresh transcript.

## Divergences from the original sketch (post-pivot)

The full pivot history is in `lab.md`. The convention-refactor additionally
removed all server-side code:

| Original                                 | Shipped (convention model)                  |
|------------------------------------------|---------------------------------------------|
| `src/node.ts` — PresentChatNode          | Deleted — rig is the user's                 |
| `src/rig.ts` — wraps node in Rig         | Deleted — rig is the user's                 |
| `src/serve.ts` — Deno HTTP listener      | Deleted — rig is the user's                 |
| `src/observe-window.ts` — TTL bridge     | Deleted — durability is the rig's business  |
| `plugin/.claude-plugin/mcp-server/`      | Deleted — use bandeira-tech/b3nd plugin MCP |
| `cc-chat://` as a fixed scheme           | Root is operator-supplied; `cc-chat://` is  |
|                                          | only a suggested default                    |
