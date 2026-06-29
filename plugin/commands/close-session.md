---
description: Close the active session — synthesize REPORT.md, clear active-session locally.
argument-hint: [extra prose for the synthesis]
---

You are closing the **active session** in the STAFF convention.

## Steps

1. **Resolve the active session id.**
   Read `.staff.local.md` (`active-session: <id>`). If absent, surface
   that there is no active session and stop.

2. **Read the session.**
   ```
   b3nd_read([
     "<root>sessions/<session-id>/MAIN.md",
     "<root>sessions/<session-id>/LEDGER.md"
   ])
   ```

3. **Synthesize REPORT.md.**
   Match the *Report shape* declared in MAIN.md. Default skeleton:
   ```markdown
   # Outcome

   <one paragraph: was the goal met? to what extent?>

   # Decisions

   - <key decision from the ledger>
   - …

   # Artifacts

   - <files written, URIs minted, links — absolute paths or URIs>

   # Open

   - <anything unresolved that the next session should pick up>
   ```

4. **Mint REPORT.md.**
   ```
   b3nd_receive { messages: [[
     "<root>sessions/<session-id>/REPORT.md",
     "<synthesis>"
   ]] }
   ```

5. **Clear `active-session`** from `.staff.local.md`.

6. **Report to the user:** session id, REPORT.md path/URI, a 2-line
   summary, and any "Open" items that need a follow-up session.

Disposition: a session that doesn't produce a REPORT failed to close
— flag that and either rerun the synthesis or mark it unfinished
explicitly.
