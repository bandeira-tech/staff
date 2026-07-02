---
description: Mint a new <ts>-update.md leaf on a session.
argument-hint: <session-name> <one-line note: decision, transition, blocker>
---

You are appending an **update** leaf to a session in the STAFF
convention. Each update is a NEW timestamped file — `<ts>-update.md`
— under the session directory. No read-modify-write: each update
stands alone.

## Steps

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

1. **Resolve the session name.**
   The session name MUST be passed in — by the user, or by the
   dispatcher / chief calling this command. There is no stored
   "current session". If the name is missing, surface that clearly
   and stop: ask the caller to pass the session name (or
   `/staff:open-session` first if none exists yet).

2. **Compose the body.**
   Format the line as: `<HH:MM> <category> <body>` where `<category>` ∈
   `decision | transition | blocker | note`. Default `note`. The body
   of the update leaf can be that single line, or expand into a short
   block if the update warrants it.

3. **Mint a new update leaf.**
   Write the file at `<root>sessions/<session-name>/<ts>-update.md`.
   If a b3nd rig is wired, the equivalent is
   `b3nd_receive { messages: [[ "<root>sessions/<session-name>/<ts>-update.md", "<body>" ]] }`.
   `<ts>` is fresh (UTC `YYYYMMDDhhmmss`) on every call — that's how
   updates remain distinct files.

4. **Echo the update** to the user. Do not enumerate prior updates.

Disposition: one update per state change. Terse. Updates are for
audit, not for narration.

If the `staff` CLI is on PATH (`command -v staff`), perform this verb
through it (see the SKILL's *The Program* table) instead of hand-rolling
file operations — same root, same rig, grammar enforced.