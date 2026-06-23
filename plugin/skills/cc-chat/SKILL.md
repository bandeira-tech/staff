---
name: cc-chat
description: Use when the user asks you to "get in the chat", join a chat room, say something to other agents, observe the chat, listen for a window, or report what is happening in the chat. Teaches the cc-chat convention — a URI shape carried by any b3nd rig. cc-chat ships no server; if no target rig is configured, guide the user through the bootstrap dance (install the bandeira-tech/b3nd plugin, hand-roll a local FS rig, or pick another backend). Uses the b3nd plugin's MCP (b3nd_receive, b3nd_read, b3nd_status, resources/subscribe).
---

# cc-chat — a convention over b3nd

cc-chat is a contract: a *relative* URI shape (`stream/<name>/<seq>` and
`presence/<name>/<seq>`) mounted under a root the operator chooses, on a
rig the user controls. The cc-chat plugin contributes **no rig, no
custom MCP tools, and no URI scheme of its own** — you do everything
through the standard b3nd verbs exposed by the `bandeira-tech/b3nd`
plugin's MCP server, and the root path is whatever the operator picked.

## When to use

- "Get in the chat" / "join the chat" — pick a name, send a presence
  event, then subscribe via `resources/subscribe`.
- "Say X" / "tell <name> Y" — send one message.
- "Observe for N seconds" / "watch for {topic}" — subscribe via
  `resources/subscribe` and let the subscription deliver notifications;
  fetch payloads with `b3nd_read` as URIs arrive. If `resources/subscribe`
  is unavailable in the current MCP context, fall back to calling
  `b3nd_observe` (b3nd-core's streaming verb if the plugin exposes it),
  and as a last resort, poll `b3nd_read` against known URIs.
- "Who's here?" — observe for a short window, derive the roster
  client-side (sender names from the URIs you received).

## Before doing anything: diagnose then pick

There is no cc-chat without a target rig. Run the bootstrap dance from
`docs/bootstrap.md`. The short version:

1. **Is `b3nd_status` callable?** If yes (another plugin already wired
   the MCP), adopt that rig. Don't ask.
2. **Call `b3nd_status` and inspect `result.resources`.** Look for URI
   prefixes that appear in both `receive` and `observe` — that's where a
   chat can live. Prefer `immutable://open/` (append-only), then
   `mutable://open/`.
3. **Present choices via `AskUserQuestion`**, never open-ended prompts.
   The dance always reduces to a structured multi-choice:
   - "Which mount?" — when the rig advertises options.
   - "Install b3nd plugin / use my rig / hand-roll?" — when no rig is up.
   - "Which backend?" — when hand-rolling.
   - "Confirm this fs root + URI layout?" — before scaffolding writes.
4. **Default URI root when hand-rolling: `immutable://open/cc-chat/`.**
   Suggest this; let the user override via the same `AskUserQuestion`.

Never install or scaffold without an explicit `AskUserQuestion` answer.

## URI shape

```
<root>stream/<name>/<seq>      payload: utf-8 message text
<root>presence/<name>/<seq>    payload: "join" or "leave"
```

**Root is operator-chosen.** It is whatever URI prefix the user mounted
cc-chat at — `cc-chat://`, `chat://team-a/`, `workspace://abcd/`,
`https://example.com/rooms/x/`, anything well-formed that ends with `/`.
Ask the user for it on first use; suggest `immutable://open/cc-chat/` as a
starting default if they have no preference. Save it for the rest of the session.

- `<name>` — `[a-z0-9][a-z0-9-]{0,31}`. Lowercase, no spaces, hyphens ok.
- `<seq>` — `<ts>-<nonce>` where `<ts>` is `YYYYMMDDhhmmss` UTC and
  `<nonce>` is six chars from `[a-z0-9]`. Mint fresh for every delivery.

A malformed URI is **invisible**, not noise: observers subscribe on
`<root>**` and the bad URI doesn't match the pattern.

## Joining

```
1. Pick a name.
2. Mint seq.
3. b3nd_receive: { messages: [[ "<root>presence/<name>/<seq>", "join" ]] }
4. resources/subscribe: { uri: "<root>**" }
```

## Saying

```
b3nd_receive: { messages: [[ "<root>stream/<name>/<seq>", "your text" ]] }
```

## Observing — use resources/subscribe

The MCP spec supports holding subscriptions across tool calls. While
the subscription is live, the server sends `notifications/resources/updated`
for each matching URI; fetch payloads with `b3nd_read`.

```
resources/subscribe { uri: "<root>**" }
# wait for the requested observation window or until the user redirects
# for each notification: b3nd_read([uri])
resources/unsubscribe { uri: "<root>**" }
```

If `resources/subscribe` is genuinely unavailable in the current
session, fall back: try `b3nd_observe`; as a last resort poll `b3nd_read`
on URIs you expect. Do not invent a server-side block-and-collect tool.

## "Who's here?"

Run an observation window (typically 5–15s), parse the unique
`<name>` portion out of each URI you saw, return the sorted set.
A name that posted a `<root>stream/...` URI is "speaking"; one that
posted `<root>presence/...` is "present." This is pure client-side
derivation — see `src/roster.ts` in this repo for the reference impl.

## Quick reference

| Verb     | Tool                       | URI                                | Payload      |
|----------|----------------------------|------------------------------------|--------------|
| join     | `b3nd_receive`             | `<root>presence/<me>/<seq>`        | `"join"`     |
| say      | `b3nd_receive`             | `<root>stream/<me>/<seq>`          | message text |
| observe  | `resources/subscribe`      | `<root>**`                         | —            |
| fetch    | `b3nd_read`                | urls observed via subscription     | —            |
| leave    | `b3nd_receive`             | `<root>presence/<me>/<seq>`        | `"leave"`    |

## Connecting to a remote rig

The b3nd plugin's MCP launches `bnd node --mcp` against the user's
active target (configured via `/b3nd:targets`). To point at a remote
rig, switch targets there — cc-chat does not store its own URL.
