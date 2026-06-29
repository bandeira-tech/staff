---
description: Append a line to the active session's LEDGER.md.
argument-hint: <one-line note: decision, transition, blocker>
---

You are appending to the **LEDGER** of the active session.

## Steps

1. **Resolve the active session id.**
   Read `.staff.local.md` (YAML frontmatter, `active-session: <id>`).
   If absent, surface that the user must `/staff:open-session` first
   and stop.

2. **Compose the line.**
   Format: `<HH:MM> <category> <body>` where `<category>` ∈
   `decision | transition | blocker | note`. Default `note`.

3. **Append.**
   ```
   b3nd_receive { messages: [[
     "<root>sessions/<session-id>/LEDGER.md",
     "<full LEDGER body so far + new line>"
   ]] }
   ```

   Note: pass-2 b3nd-save semantics are write-replace, not append. To
   preserve history, read the existing body first, append the new
   line, then write the whole thing back. (Pass-3 may add a true
   append primitive; until then, read-modify-write.)

4. **Echo the appended line** to the user. Do not restate the entire
   ledger.

Disposition: one line per state change. Terse. The ledger is for
audit, not for narration.
