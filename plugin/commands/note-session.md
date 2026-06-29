---
description: Mint a new <ts>-update.md leaf on a session.
argument-hint: <one-line note: decision, transition, blocker>
---

You are appending an **update** leaf to a session in the STAFF
convention. Each update is a NEW timestamped file — `<ts>-update.md`
— under the session directory. No read-modify-write: each update
stands alone.

## Steps

1. **Resolve the session name.**
   - We'll address active-session tracking once the design lands;
     for now expect the session name to be provided (by the user, or
     by the dispatcher / chief of staff calling this command).
   - If the session name is absent, surface that the user must
     `/staff:open-session` first (or pass the name explicitly) and stop.

2. **Compose the body.**
   Format the line as: `<HH:MM> <category> <body>` where `<category>` ∈
   `decision | transition | blocker | note`. Default `note`. The body
   of the update leaf can be that single line, or expand into a short
   block if the update warrants it.

3. **Mint a new update leaf.**
   ```
   b3nd_receive { messages: [[
     "<root>sessions/<session-name>/<ts>-update.md",
     "<body>"
   ]] }
   ```
   `<ts>` is fresh (UTC `YYYYMMDDhhmmss`) on every call — that's how
   updates remain distinct files.

4. **Echo the update** to the user. Do not enumerate prior updates.

Disposition: one update per state change. Terse. Updates are for
audit, not for narration.
