# Design

The picked design from `lab.md`, updated to reflect the unified-grammar
refactor and worker-room model. cc-chat contributes no rig.

## URI vocabulary

One canonical shape under the operator-chosen root:

```
<root><room>/<participant>/<type>/<ts>-<slug>.md
```

with one exception — the room identity card:

```
<root><room>/meta.md
```

Segments:
- `<root>` — operator-supplied; default `immutable://open/cc-chat/`.
- `<room>` — `<ts>-<slug>`, e.g. `20260624120000-standup`.
- `<participant>` — `[a-z0-9][a-z0-9-]{0,31}`; manager is always `manager`.
- `<type>` — closed set: `join`, `msg`, `pause`, `resume`, `end`,
  `mention`, `output`.
- leaf `<ts>-<slug>` — message's own UTC timestamp + content slug or
  6-char base32 nonce. `.md` for all types; `.json` for `join`.

Manager-only types: `pause`, `resume`, `output`, room-closing `end`.

See [`docs/contract.md`](contract.md) for the full grammar, type table,
and protocol guarantees.

## File layout

```
src/
  protocol.ts    — pure: URI parsing, name validation, mint helpers,
                   validate(); root is a required arg; 7 type builders
  client.ts      — HttpClient wrapper: receive, observe, read against any rig URL
  roster.ts      — derive "who's around" from join/end events (no server-side roster)
  tail.ts        — async iterator over remote deliveries
  mod.ts         — re-exports protocol + client + roster
tests/
  protocol_test.ts    — URI builders / parsers / validators (28 tests)
  client_test.ts      — HTTP wire round-trip (1 test)
  roster_test.ts      — roster derivation from join/end events (3 tests)
  tail_test.ts        — tail iterator (6 tests)
  coordination_test.ts — full coordination lifecycle (1 test): meta →
                         join → msgs → pause/resume → output → end
web/
  index.html     — static UI shell; reads ?url= and ?root= from query string
  app.js         — NDJSON observe + JSON read loop, DOM update,
                   type-aware lanes (msg/join/end/pause/resume/mention/output),
                   meta.md header strip, presence panel
plugin/
  .claude-plugin/
    plugin.json            Claude Code plugin manifest
    marketplace.json
  skills/cc-chat/SKILL.md  URI grammar + worker-room disposition + bootstrap dance
  commands/
    join.md    say.md    observe.md    who.md    manage-coordination.md
scripts/
  say.ts   tail.ts         CLI senders + viewer (--url, --root, --room, --type flags)
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

Pure function — no rig, no IO. Extracts the `<room>`, `<participant>`,
and `<type>` segments from a snapshot of observed URIs. Tracks `join`
and `end` events to determine who is currently in the room. No
server-side roster — the UI applies a warm→cold gradient from observed
traffic recency.

## Protocol (`src/protocol.ts`)

```ts
// Mint helpers (one per type)
metaUri(root, room): string
joinUri(root, room, who, date?): string
msgUri(root, room, who, slug, date?): string
pauseUri(root, room, date?): string
resumeUri(root, room, date?): string
endUri(root, room, who, date?): string
mentionUri(root, room, from, to, slug, date?): string
outputUri(root, room, slug, date?): string

// Parse / validate
parseUri(root, uri): ParsedUri | null
validate(root, uri): void   // throws on invalid or manager-only violation

// Helpers
mintRoom(slug, date?): string
mintNonce(): string
formatTs(date): string
isValidName(name): boolean
isValidRoom(room): boolean
isValidType(type): boolean
```

Root is always a required argument. No default root is baked into the
library. Callers pass the root they negotiated during bootstrap.

## Web UI

A single page, parameterised by `?url=` and `?root=`. Fetches
`<root>meta.md` on load (if present) and renders it as a room header
strip. The live `observe` NDJSON stream drives type-aware lanes:
`msg` rows (colored by participant), `join`/`end` status rows,
`pause`/`resume` banners, `mention` rows with @target badge, and an
`output` highlighted card. When the NDJSON stream disconnects, the
page reconnects automatically. The presence panel derives "who's
around" from `join`/`end` events and message recency.

The UI is intentionally text-first — closer to a tail-of-log than a
chat app.

## Coordination command (`plugin/commands/manage-coordination.md`)

The manager runbook and inlined participant template. No separate
`plugin/agents/` file — the participant prompt is interpolated
per-call directly from `manage-coordination.md`. The manager:

1. Parses prose → plan (goal, participants, room name, deliverable).
2. Checks tool budget (reads `.claude/cc-chat.local.md`).
3. Mints `meta.md`.
4. Joins as manager, spawns participants (`run_in_background: true`).
5. Facilitates (observe loop, pause/resume, relay user messages).
6. Drafts deliverable, writes working-tree file, posts `output` URI.
7. Mints `manager/end`, reports to user.

## What today's tests cover

- `protocol_test.ts` — URI builders / parsers / validators (28 tests).
- `client_test.ts` — receive→observe fanout over the HTTP wire (1 test).
- `roster_test.ts` — roster derivation from join/end events (3 tests).
- `tail_test.ts` — terminal tail iterator (6 tests).
- `coordination_test.ts` — full lifecycle with fake rig + fake manager +
  2 fake participants (1 test).

Total: 39 tests.

## Divergences from the original sketch (post-pivot)

The full pivot history is in `lab.md`. The unified-grammar refactor
additionally removed the old `stream`/`presence` two-shape convention:

| Original                                 | Shipped (unified grammar)                   |
|------------------------------------------|---------------------------------------------|
| `src/node.ts` — PresentChatNode          | Deleted — rig is the user's                 |
| `src/rig.ts` — wraps node in Rig         | Deleted — rig is the user's                 |
| `src/serve.ts` — Deno HTTP listener      | Deleted — rig is the user's                 |
| `src/observe-window.ts` — TTL bridge     | Deleted — durability is the rig's business  |
| `plugin/.claude-plugin/mcp-server/`      | Deleted — use bandeira-tech/b3nd plugin MCP |
| `cc-chat://` as a fixed scheme           | Root is operator-supplied; default is       |
|                                          | `immutable://open/cc-chat/`                 |
| `stream/<name>/<seq>` URI shape          | `<room>/<participant>/msg/<ts>-<slug>.md`   |
| `presence/<name>/<seq>` URI shape        | `<room>/<participant>/join/<ts>-<nonce>.json` and `.../end/...` |
| No rooms                                 | `<room>` segment is required                |
| 2 URI types (stream, presence)           | 7 URI types + meta.md special case          |
| No coordination                          | `/cc-chat:manage-coordination` + worker rooms |
