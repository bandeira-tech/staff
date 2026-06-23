# Lab: explorations

This document walks through the design choices for a present-only chat
built on B3nd, ending at the design we will build today. It is meant to
preserve the reasoning, so the next person reading the implementation
can ask *"why this and not that?"* and find an answer.

## The setting

B3nd gives us:

- A `ProtocolInterfaceNode` (PIN) with four primitives: `receive`, `read`,
  `observe`, `status`. Each protocol implements PIN.
- An `ObserveEmitter` base class that does the listener bookkeeping for
  `observe` — async iterator, abort signal, no-drop queue.
- A `Rig` that composes routes + programs + handlers + reactions + hooks
  across transports. Same shape in-process, over HTTP/WS/gRPC/MCP.

The `Rig` is more machinery than we need for a single-stream pub/sub.
We want to choose carefully whether to lean on it or stand a bare PIN.

## Exploration 1 — URI shape

A b3nd protocol is its URIs. Three candidates:

### A. Per-message URI keyed by timestamp + sender

```
cc-chat://stream/{ts}-{name}    payload: utf-8 message body
cc-chat://presence/{name}       payload: "join" or "leave"
```

- **Pro:** every delivery has a unique URI; observers can filter by
  prefix (presence vs stream) the standard way.
- **Pro:** matches taskwatch's "human-readable URIs, plain-text payload"
  ethos — no JSON envelopes.
- **Con:** the `{ts}` part is meaningless on a present chat. Nothing
  ever reads it back. It's overhead.

### B. Single fixed URI

```
cc-chat://stream                payload: utf-8 message body
cc-chat://presence              payload: "{name} joined" / "{name} left"
```

- **Pro:** minimal. Two URIs, that's the whole vocabulary.
- **Con:** loses sender identity at the URI layer — observers have to
  parse the body, which means we now have a body schema.
- **Con:** observers can't filter by sender (e.g. *show me only
  `researcher`'s messages*) without re-parsing.

### C. Per-sender stream URI

```
cc-chat://stream/{name}         payload: utf-8 message body
cc-chat://presence/{name}       payload: "join" or "leave"
```

- **Pro:** sender is in the URI. Observers can subscribe with patterns
  like `cc-chat://stream/researcher` or `cc-chat://stream/*`.
- **Pro:** no fake timestamps in URIs.
- **Pro:** matches the b3nd glob grammar (`*` for one segment, `**` for
  rest).
- **Con:** if `researcher` says two messages in the same delivery window,
  the URIs are the same and the observe emitter coalesces — but actually
  this is *fine* because every emit goes through the listener; URI
  collisions only collapse in a read-then-fold model, and we don't have
  one of those.

**Picked: C.** The URI carries the sender, observers can pattern-match,
and there are no synthetic timestamps. The payload is the message.

### Vocabulary summary

```
cc-chat://stream/{name}     — a message from {name}, payload is body
cc-chat://presence/{name}   — presence event from {name}, payload is "join"|"leave"
```

`{name}` is a slug: `[a-z0-9][a-z0-9-]{0,31}`. No display-name
prettiness yet. The protocol does not own a basepath — `cc-chat://`
is the only scheme it speaks, and it speaks it everywhere.

## Exploration 2 — node shape (Rig vs bare PIN)

### A. Full Rig with programs + handlers + reactions

```ts
const rig = new Rig({
  routes: { receive: [chatNode], read: [chatNode], observe: [chatNode] },
  programs:  { "cc-chat://": classify },
  handlers:  { "chat:msg": fanout, "chat:presence": fanout },
});
```

- **Pro:** structurally identical to every other b3nd protocol.
- **Con:** the program/handler split exists to let a protocol *interpret*
  a payload (does it satisfy a balance check? is it a confirmed write?).
  We have nothing to interpret. The classifier would always return one
  code and the handler would always do the same thing.

### B. Bare `ProtocolInterfaceNode` subclassing `ObserveEmitter`

```ts
export class PresentChatNode extends ObserveEmitter implements PIN {
  async receive(uri, payload) { this._emit(uri, payload); return { ok: true }; }
  async *read()              { return; }
  async status()             { return { ok: true }; }
  // observe inherited from ObserveEmitter
}
```

- **Pro:** the simplest thing that could possibly work. Reads literally
  return nothing because there is no history.
- **Pro:** still implements the PIN interface, so it slots into a `Rig`
  later if we want HTTP/MCP transports — and we will.
- **Con:** none for the MVP. We can lift to a `Rig` later for transport
  multiplexing without rewriting the protocol.

**Picked: B.** A bare PIN node. Transports compose it via `b3nd-move`'s
HTTP and MCP services; the rig layer only enters when we wire a service.

## Exploration 3 — presence model

When does an agent "join"?

### A. Explicit join/leave

The MCP plugin's `chat_join` tool emits a `cc-chat://presence/{name}`
event with payload `"join"`. A `chat_leave` tool emits `"leave"`. The web
UI listens to both URIs and renders presence-line entries.

- **Pro:** clean, observable, deletable.
- **Con:** if an agent disconnects without calling `leave`, presence
  goes stale. But there's no presence list to be stale against —
  presence is a *delivery* like any other, not state.

### B. First-say implies join

The first time a name shows up in `cc-chat://stream/*`, the node emits a
synthetic `cc-chat://presence/{name} join`. Subsequent silence is
silence.

- **Pro:** one fewer surface verb.
- **Con:** loses the "I am here listening but I have nothing to say"
  moment. The web UI cannot show "researcher is observing".

**Picked: A.** Explicit join. It costs one extra MCP tool but maps onto
the user's spec: *"I come in and say get in the chat, the agent
register a name, and then starts observing."* Register is its own act.

There is no leave for the MVP — when an observe iterator aborts, that
is the leave, and the rig stops fanning out to it on its own. The
`chat_leave` tool can be added the day someone needs it.

## Exploration 4 — surfaces for today

- **MCP** — primary agent surface. Tools: `chat_join`, `chat_say`,
  `chat_observe`. Backed by b3nd-move's MCP service.
- **HTTP** — backs the web UI. `POST /receive` for messages, `GET /sse`
  for the EventSource stream. b3nd-move's HTTP service handles `POST` /
  `GET` already; the SSE bit is the web UI's adaptation of the observe
  stream.
- **In-process** — for tests. Construct a `PresentChatNode` directly,
  call `receive`, drive `observe` with an AbortController.

CLI is not in scope today. `bnd send / observe` against the HTTP service
would work without writing any new code; if we want it we already have
it via the existing CLI.

## Exploration 5 — test strategy

TDD against the in-process node first, because that's where every
surface bottoms out. Three layers of tests:

1. **Protocol** (`tests/protocol.test.ts`) — pure functions: URI
   building, name validation, message parsing. No node, no async.
2. **Node** (`tests/node.test.ts`) — `PresentChatNode` end-to-end:
   `receive` emits, `read` returns nothing, `observe` yields, abort
   stops cleanly, multiple observers each get the message, no history.
3. **HTTP surface** (`tests/http.test.ts`) — start the HTTP service on
   an ephemeral port, POST to receive, SSE to observe, assert the
   delivery shape.

MCP integration is harder to TDD against directly; we will smoke-test it
by hand and add an integration test if time allows.

## Picked design (summary)

- **Protocol vocabulary:** `cc-chat://stream/{name}` for messages,
  `cc-chat://presence/{name}` for join/leave. Payload is the message
  body (plain UTF-8) or the literal `join` / `leave`.
- **Node:** bare `ProtocolInterfaceNode` subclassing `ObserveEmitter`.
  `receive` emits, `read` returns nothing, `observe` is inherited,
  `status` returns ok.
- **Surfaces today:** in-process (tested), HTTP+SSE (web UI), MCP (agents).
- **Web UI:** static page, EventSource against `/sse`, no scrollback.
  Presence events rendered as a thin grey line, messages as a normal
  line.
- **Stack:** Deno (matches b3nd's native toolchain), no NPM build today.
  Vanilla HTML + Tailwind for the UI to keep it simple and styled.

The next document is `design.md`, which restates this in spec form and
lists the file layout we will create.
