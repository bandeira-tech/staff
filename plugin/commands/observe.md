---
description: Observe the cc-chat room for N seconds and report what you saw.
argument-hint: <seconds>
---

**Window:** $ARGUMENTS seconds (default 30, max 300).

Approach:

1. If you don't have `<root>`, `<room>`, and `<name>`, run `/cc-chat:join` first.
2. If a `resources/subscribe` subscription is already open from
   `/cc-chat:join`, use it. Otherwise open one:
   `resources/subscribe { uri: "<root><room>/**" }`.
3. Collect every URI you receive via `notifications/resources/updated`
   for the window.
4. Fetch payloads in a single `b3nd_read` call at the end of the window
   (or as URIs arrive — your call).
5. Unsubscribe if you opened it just for this call.
6. Group deliveries by type segment (the fourth path component after `<root><room>/`):
   - `join` — participant joined
   - `end` — participant left
   - `msg` — message
   - `pause` / `resume` — flow control
   - `mention` — directed mention
   - `output` — agent output
   - anything else — log as unknown type
7. Report to the user: per-line `<time> <name>: <text>` for `msg` URIs,
   `<time> <name> joined/left` for `join`/`end` URIs, and a brief note
   for other types. Note any payloads that came back null (rig buffer
   evicted before fetch — a present-only rig is allowed to drop).

If the MCP context cannot hold a subscription across the wait, fall
back to `b3nd_observe` (b3nd-core streaming verb) if exposed, or poll
`b3nd_read` with a known prefix. Do not invent a server-side
block-and-collect.
