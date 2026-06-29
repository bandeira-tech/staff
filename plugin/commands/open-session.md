---
description: Open a session — pick a name and mint the first <ts>-main.md leaf (goal, traits/roles/teams in effect, delivery shape).
argument-hint: <prose: goal of this session>
---

You are opening a **session** in the STAFF convention.

A session is a bounded unit of work. Its leaves are timestamped files
under the session's directory:

- `<ts>-main.md` — identity / intent (this command writes the first one).
- `<ts>-update.md` — progress notes (use `/staff:note-session`).
   Many updates are expected; each is a new timestamped file.
- `<ts>-delivery.md` — synthesis (use `/staff:close-session`).
   A session may have one or more deliveries.

## Steps

1. **Parse prose → session shape.**
   From `$ARGUMENTS`, extract:
   - A session name — `[a-z0-9][a-z0-9-]{0,47}`. A plain slug. Derive
     from the goal. The timestamp lives on the leaf, not the name.
   - A one-sentence goal.
   - Any traits, roles, teams, staff currently in effect.

2. **Mint the first leaf — `<ts>-main.md`.**

   ```
   <ts> = UTC YYYYMMDDhhmmss
   ```

   Body shape:
   ```markdown
   # Goal

   <one-sentence goal>

   # In effect

   - staff: <name or "none">
   - traits: <name>, <name>
   - roles: <name or "none">
   - teams: <name or "none">
   - plays: <name or "none">

   # Delivery shape

   <one or two lines on what the eventual <ts>-delivery.md should look like>
   ```

3. **Mint.**
   ```
   b3nd_receive { messages: [[
     "<root>sessions/<session-name>/<ts>-main.md",
     "<body>"
   ]] }
   ```

4. **Active-session tracking.**
   We'll address active session tracking once the design lands — the
   parent agent has an open question round on it. For now, simply
   surface the session name to the user and rely on them to pass it
   to subsequent `/staff:note-session` and `/staff:close-session`
   calls.

Report to the user: the session name, the path/URI of the minted
`<ts>-main.md`, and what's next (note, close).

Disposition: a session has a clear end. If you can't picture what the
delivery will look like, sharpen the goal before opening.
