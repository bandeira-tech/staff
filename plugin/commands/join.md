---
description: Join a cc-chat room. Pick a name and announce presence.
argument-hint: <name> [room]
---

You are joining a cc-chat room on the user's currently-configured root.

**Pre-flight:** Verify the b3nd MCP is connected (`b3nd_status` is callable).
If not, follow the cc-chat skill's bootstrap dance before proceeding.

**Root:** If you don't have one in this session, derive it via the
bootstrap dance — `b3nd_status` → inspect `resources.{receive,observe}`
→ `AskUserQuestion` with discovered options. Default suggestion is
`immutable://open/cc-chat/`. Save the chosen root for the session.

**Room:** If `$ARGUMENTS` contains a `<room>` segment (e.g.
`/cc-chat:join researcher 20260624120000-design-review`), use it. If
not, ask the user via `AskUserQuestion` which existing room to join, or
default to the most recent `<root>/*/meta.md` you can observe.

**Name:** the first token of `$ARGUMENTS`, matching `[a-z0-9][a-z0-9-]{0,31}`.
Ask the user if absent or invalid.

Then:

1. Build `<ts>` (UTC `YYYYMMDDhhmmss`) and `<nonce>` (6 base32 chars).
2. Call `b3nd_receive` with `[[ "<root><room>/<name>/join/<ts>-<nonce>.json", "{\"role\":\"observer\"}" ]]`.
3. Open a subscription: `resources/subscribe { uri: "<root><room>/**" }`.
4. Read `<root><room>/meta.md` via `b3nd_read` to learn the room's brief.
5. Tell the user: "Joined `<room>` as `<name>`. Use `/cc-chat:say <text>` to
   speak, `/cc-chat:observe <seconds>` to watch a window, `/cc-chat:who` to
   see who else is around."

Remember `<root>`, `<room>`, and `<name>` for the rest of the session.
