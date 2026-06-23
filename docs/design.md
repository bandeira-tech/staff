# Design

The picked design from `lab.md`, ready to implement.

## URI vocabulary

```
cc-chat://stream/{name}      payload: utf-8 message body
cc-chat://presence/{name}    payload: "join" | "leave"
```

`{name}` is `[a-z0-9][a-z0-9-]{0,31}`. The scheme is fixed at
`cc-chat://`. Payload is plain UTF-8 text. No JSON envelope.

## File layout

```
src/
  protocol.ts        — pure: URI parsing, name validation, builders
  node.ts            — PresentChatNode (PIN + ObserveEmitter)
  http.ts            — HTTP service factory: POST /receive, GET /sse
  mcp.ts             — MCP server registering chat_join / chat_say / chat_observe
  serve.ts           — entrypoint: bring up HTTP + serve web UI from /
  deps.ts            — pinned re-exports of @bandeira-tech/b3nd-core
tests/
  protocol_test.ts   — URI shape, name validation
  node_test.ts       — receive emits, read empty, observe fans out, abort
  http_test.ts       — POST → SSE round-trip
web/
  index.html         — static UI shell
  app.js             — EventSource subscription, DOM update
  styles.css         — Tailwind-style minimal styling
deno.json            — task: test, serve, mcp
README.md
```

## Node API (PIN)

```ts
class PresentChatNode extends ObserveEmitter implements PIN {
  async receive(uri: string, payload: unknown): Promise<ReceiveResult>
  // read returns no rows — present chat has no history
  read(_locator: string): AsyncIterable<[string, unknown]>
  // observe inherited from ObserveEmitter
  async status(): Promise<StatusResult>
}
```

`receive` validates the URI shape, normalizes the payload to a UTF-8
string, then `_emit(uri, body)`. Invalid URIs throw.

`read` is an empty async iterable: `return; yield;` style.

`status` returns `{ ok: true }`.

## HTTP surface

```
POST  /receive    body: { uri: string, payload: string }   → 204
GET   /sse        text/event-stream of received deliveries  → 200
GET   /           the static web UI                          → 200
GET   /assets/*   the JS/CSS for the UI                      → 200
```

The SSE stream sends one event per delivery:

```
event: chat
data: {"uri":"cc-chat://stream/researcher","payload":"hi"}

```

The client treats `cc-chat://presence/*` events as presence lines and
the rest as messages.

## MCP surface

Three tools, each thin:

- `chat_join(name)` — POSTs `cc-chat://presence/{name}` `join`
- `chat_say(name, text)` — POSTs `cc-chat://stream/{name}` `text`
- `chat_observe(seconds?, name?)` — opens an SSE subscription for
  `seconds` (default 30, max 300) and returns the deliveries it saw,
  optionally filtered by `name`.

Implementation note: `chat_observe` is *blocking* from the agent's
perspective — the tool call returns when the window closes. For the
"observe every 5 minutes" pattern, the agent reschedules itself
(ScheduleWakeup) after each window. We are not yet inverting the flow
into a push-based MCP notification.

## Web UI

A single page. No history, no scrollback. Presence events render as a
grey one-liner (`researcher joined`); messages render as `name: body`.
When the EventSource disconnects, the page shows a quiet "disconnected"
banner and reconnects on its own.

The UI is intentionally text-first — closer to a tail-of-log than a
chat app. That is what *present* feels like.

## What today's TDD covers

- `protocol_test.ts` — URI builders / parsers / validators (10–15 tests).
- `node_test.ts` — receive→observe fanout, no history, multiple observers,
  abort cleanly (5–8 tests).
- `http_test.ts` — POST /receive emits to a live SSE client (2–3 tests).

MCP is smoke-tested by wiring the Claude Code plugin and joining the
chat from a session. A unit test for the MCP layer is a stretch goal.
