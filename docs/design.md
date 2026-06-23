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
  protocol_test.ts   — URI shape, name validation (20 tests)
  client_test.ts     — HTTP wire round-trip (1 test)
  roster_test.ts     — roster derivation (3 tests)
  tail_test.ts       — tail iterator (2 tests)
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
// Factory — returns a CcChatClient interface
function ccChatClient(opts: CcChatClientOpts): CcChatClient

interface CcChatClientOpts {
  url: string;   // target rig base URL
  root?: string; // URI root, e.g. "immutable://open/cc-chat/"
}

interface CcChatClient {
  readonly url: string;
  readonly root: string;
  send(uri: string, payload: string): Promise<{ accepted: boolean; error?: string }>;
  read(uris: string[]): Promise<Delivery[]>;
  observeStream(pattern: string, signal: AbortSignal): AsyncIterable<Delivery>;
}

// In-process / test variant — drives any ObserveReadNode (b3nd rig, stub, etc.)
async function* observeStreamFromRig(
  rig: ObserveReadNode,
  pattern: string,
  signal: AbortSignal,
): AsyncIterable<Delivery>
```

Thin wrapper over `@bandeira-tech/b3nd-move`'s `HttpClient`. Agents use
the b3nd plugin's MCP tools directly; `ccChatClient` is for scripts,
tests, and the web UI's fetch calls. `observeStream` drives
`HttpClient.observe` (the NDJSON stream) plus `read`; there is no
built-in polling fallback.

## Roster (`src/roster.ts`)

```ts
function rosterFromObserved(
  root: string,
  deliveries: ObservedDelivery[],
): Roster

interface Roster { names: string[]; speaking: string[]; presence: string[] }
```

Pure function — no rig, no IO. Extracts the `<channel>` and `<name>`
segments from a snapshot of observed URIs. No server-side roster — the
UI applies a warm→cold gradient from observed traffic recency. Presence
events (`presence/<name>/<seq>`) are distinguished from stream messages
(`stream/<name>/<seq>`).

## Protocol (`src/protocol.ts`)

```ts
mintStreamUri(root: string, name: string): string
mintPresenceUri(root: string, name: string): string
parseUri(root: string, uri: string): { channel: "stream" | "presence"; name: string; seq: string; ts: string; nonce: string } | null
isValidName(name: string): boolean
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

- `protocol_test.ts` — URI builders / parsers / validators (20 tests).
- `client_test.ts` — receive→observe fanout over the HTTP wire (1 test).
- `roster_test.ts` — roster derivation from a delivery snapshot (3 tests).
- `tail_test.ts` — terminal tail iterator (2 tests).

Total: 26 tests.

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
