---
description: Open a session — mint a session id and write MAIN.md (goal, staff/traits in effect, report shape).
argument-hint: <prose: goal of this session>
---

You are opening a **session** in the STAFF convention.

A session is a bounded unit of work. Its three leaves are:

- `MAIN.md` — identity / intent (this command writes it).
- `LEDGER.md` — append-only journal (use `/staff:note-session`).
- `REPORT.md` — final synthesis (use `/staff:close-session`).

## Steps

1. **Parse prose → session shape.**
   From `$ARGUMENTS`, extract:
   - A short slug for the session name — `[a-z0-9][a-z0-9-]{0,47}`.
     Derive from the goal.
   - A one-sentence goal.
   - Any staff/traits/plays currently in effect (read from active
     session state if present).

2. **Mint the session id.**
   ```
   <session-id> = <ts>-<slug>      where <ts> is UTC YYYYMMDDhhmmss
   ```

3. **Write MAIN.md.**
   Body shape:
   ```markdown
   # Goal

   <one-sentence goal>

   # Staff in effect

   - staff: <name or "none">
   - traits: <name>, <name>
   - plays: <name or "none">

   # Report shape

   <one or two lines on what REPORT.md should look like at close>
   ```

4. **Mint.**
   ```
   b3nd_receive { messages: [[
     "<root>sessions/<session-id>/MAIN.md",
     "<body>"
   ]] }
   ```

5. **Record the active session id locally** so subsequent
   `/staff:note-session` and `/staff:close-session` calls know which
   session to write to. Recommended seam: a small `.staff.local.md`
   file in the project, YAML frontmatter:
   ```yaml
   ---
   active-session: <session-id>
   ---
   ```

Report to the user: the session id, the path to MAIN.md, and what's
next (note, close).

Disposition: a session has a clear end. If you can't picture what
REPORT.md will look like, sharpen the goal before opening.
