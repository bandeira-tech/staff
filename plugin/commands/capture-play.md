---
description: Capture a play — a reusable workflow with phases, gates, and outputs.
argument-hint: <prose: goal, phases, expected output>
---

You are capturing a **play** in the STAFF convention.

A play is a reusable workflow — one of the six STAFF primitives
alongside `traits`, `roles`, `teams`, `staff`, and `sessions`.
Phases, gates between them, expected outputs at the end.

## Steps

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

1. **Parse prose → play shape.**
   - `<name>` — `[a-z0-9][a-z0-9-]{0,47}`. Derive from the goal.
   - Goal — one sentence.
   - Phases — 2–6, each one short imperative line.
   - Participants (roles, teams) and expected deliveries.

2. **Sketch the body.**
   ```
   # Goal
   <one sentence>

   # Participants
   <roles / teams expected to take part>

   # Phases
   1. <phase>
   2. <phase>

   # Deliveries
   - <what the play produces>
   ```

3. **Mint.**
   Write the file at `<root>plays/<name>/main.md`. If a b3nd rig is
   wired, the equivalent is
   `b3nd_receive { messages: [[ "<root>plays/<name>/main.md", "<body>" ]] }`.

4. **Optionally log inside a session.**
   If a session name was passed in alongside the play capture, append
   the event as a new update leaf on that session: write
   `<root>sessions/<session-name>/<ts>-update.md` with body
   `captured play <name>` (or the b3nd_receive equivalent on the
   same URI). If no session name was passed, skip this step — there
   is no stored "current session" to fall back on.

Disposition: a play earns its keep by running. If you cannot picture
the next time it will run, push back on capturing it. Historical
context belongs to session updates, not on `main.md`.
