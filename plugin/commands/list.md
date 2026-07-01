---
description: List traits, roles, plays, teams, staff, or recent sessions.
argument-hint: <resource> [name]
---

You are listing entries in the STAFF convention.

## Steps

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

1. **Parse `$ARGUMENTS`.**
   - `<resource>` ∈ { traits, roles, plays, teams, staff, sessions } —
     the six STAFF primitives.
   - Optional `<name>` (or session name) for revisions / leaves under a
     single entry.

2. **List.**
   Primary: `ls <root>canon/<resource>/` on disk (the canonized
   entries). Sessions sit outside canon: `ls <root>sessions/`.
   - proposals for a card: `ls <root>proposal/<card>/<name>/` — one
     `<ts>/` subtree per pending proposal.
   - leaves of a session: `ls <root>sessions/<name>/` (leaves may be
     grouped under `cast/<member>/`).
   If a b3nd rig is wired, the equivalent is
   `b3nd_read([ "<root>canon/<resource>/?fn=ls" ])` (and the proposal
   or per-session variants on the same shape).

3. **Render.**
   - For card resources (`traits`, `roles`, `plays`, `teams`, `staff`):
     one line per entry under `<root>canon/<resource>/`, `<name>` +
     first line of its `main.md` (or its first gate's title if it is
     gates-only).
   - For `sessions`: group by recency, sorted by the most recent leaf
     timestamp in each session directory (newest first). Render in two
     distinct groups so the chief can orient:
     - **Open** — sessions with no `<ts>-delivery.md` leaf anywhere
       (session root or under any `cast/<member>/`).
     - **Delivered** — sessions with at least one `<ts>-delivery.md`.
     Show each as `<name>` + its mandate (from `meta`, else the first
     `<ts>-main.md`). Cap each group at the most recent ~20. The
     listing is the orientation surface — there is no registry, per
     the SKILL's "Sessions are logs, not state".
   - For a specific card `<name>`: the canonized entry at
     `<root>canon/<card>/<name>/` first, then pending proposals under
     `<root>proposal/<card>/<name>/` (newest `<ts>/` first).
   - For a specific session `<name>`: enumerate its `<ts>-main.md`,
     `<ts>-update.md`, `<ts>-delivery.md` leaves (at the root or under
     `cast/<member>/`) in timestamp order.

Disposition: terse. The list is for orientation, not for reading.
