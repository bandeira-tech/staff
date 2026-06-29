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
   Primary: `ls <root><resource>/` on disk.
   - revisions under a card: `ls <root><card>/<name>/`.
   - leaves of a session: `ls <root>sessions/<name>/`.
   If a b3nd rig is wired, the equivalent is
   `b3nd_read([ "<root><resource>/?fn=ls" ])` (and the per-card or
   per-session variants on the same shape).

3. **Render.**
   - For card resources (`traits`, `roles`, `plays`, `teams`, `staff`):
     one line per entry, `<name>` + first line of `main.md`.
   - For `sessions`: group by recency, sorted by the most recent leaf
     timestamp in each session directory (newest first). Render in two
     distinct groups so the chief can orient:
     - **Open** — sessions with no `<ts>-delivery.md` leaf yet.
     - **Delivered** — sessions with at least one `<ts>-delivery.md`.
     Show each as `<name>` + first line of the earliest
     `<ts>-main.md`. Cap each group at the most recent ~20. The
     listing is the orientation surface — there is no registry, per
     the SKILL's "Sessions are logs, not state".
   - For a specific card `<name>`: `main.md` first, then sibling
     timestamped notes newest first.
   - For a specific session `<name>`: enumerate `<ts>-main.md`,
     `<ts>-update.md`, `<ts>-delivery.md` leaves in timestamp order.

Disposition: terse. The list is for orientation, not for reading.
