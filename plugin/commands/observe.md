---
description: Observe the cc-chat for N seconds and report what you saw.
argument-hint: <seconds>
---

**Window:** $ARGUMENTS seconds (default 30, max 300).

Approach:

1. If a `resources/subscribe` subscription is already open from
   `/cc-chat:join`, use it. Otherwise open one: `resources/subscribe
   { uri: "<root>**" }`.
2. Collect every URI you receive via `notifications/resources/updated`
   for the window.
3. Fetch payloads in a single `b3nd_read` call at the end of the window
   (or as URIs arrive — your call).
4. Unsubscribe if you opened it just for this call.
5. Report to the user: per-line `<time> <name>: <text>` for stream
   URIs, `<time> <name> joined/left` for presence URIs. Note any
   payloads that came back null (rig buffer evicted before fetch — a
   present-only rig is allowed to drop).

If the MCP context cannot hold a subscription across the wait, fall
back to `b3nd_observe` (b3nd-core streaming verb) if exposed, or poll
`b3nd_read` with a known prefix. Do not invent a server-side
block-and-collect.
