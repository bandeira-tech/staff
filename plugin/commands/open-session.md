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

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

1. **Parse prose → session shape.**
   From `$ARGUMENTS`, extract:
   - A session name — `[a-z0-9][a-z0-9-]{0,47}`. A plain slug. Derive
     from the goal. The timestamp lives on the leaf, not the name.
   - A one-sentence goal.
   - Any traits, roles, teams, staff currently in effect.

2. **Resume-by-name discipline.**
   List existing session directories under `<root>sessions/`. If the
   proposed name matches one exactly, you are resuming — skip to step
   3 and append a fresh `<ts>-main.md` to the existing log. If the
   proposed name looks similar to an existing one (typo distance),
   ask the user to disambiguate: reuse the existing name, or pick a
   clearly different one. A typo silently forks the log.

3. **Compose the first leaf — `<ts>-main.md`.**

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

4. **Mint.**
   Write the file at `<root>sessions/<session-name>/<ts>-main.md`. If
   a b3nd rig is wired, the equivalent is
   `b3nd_receive { messages: [[ "<root>sessions/<session-name>/<ts>-main.md", "<body>" ]] }`.

Report to the user: the session name, the path/URI of the minted
`<ts>-main.md`, and what's next (note, close). The chief (or user)
carries the session name forward — there is no stored "current
session"; subsequent `/staff:note-session` and `/staff:close-session`
calls must be passed the name explicitly.

Disposition: a session has a clear end. If you can't picture what the
delivery will look like, sharpen the goal before opening.

If the `staff` CLI is on PATH (`command -v staff`), perform this verb
through it (see the SKILL's *The Program* table) instead of hand-rolling
file operations — same root, same rig, grammar enforced.