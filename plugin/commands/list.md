---
description: List traits, roles, plays, teams, staff, or recent sessions.
argument-hint: <resource> [name]
---

You are listing entries in the STAFF convention.

## Steps

1. **Parse `$ARGUMENTS`.**
   - `<resource>` ∈ { traits, roles, plays, teams, staff, sessions } —
     the six STAFF primitives.
   - Optional `<name>` (or session name) for revisions / leaves under a
     single entry.

2. **List.**
   - Pass 2:
     - all entries: `b3nd_read([ "<root><resource>/?fn=ls" ])`
     - revisions under a card: `b3nd_read([ "<root><card>/<name>/?fn=ls" ])`
     - leaves of a session: `b3nd_read([ "<root>sessions/<name>/?fn=ls" ])`
   - MVP: directory list the configured staff root on disk.

3. **Render.**
   - For card resources (`traits`, `roles`, `plays`, `teams`, `staff`):
     one line per entry, `<name>` + first line of `main.md`.
   - For `sessions`: most recent 20 session directories, newest first
     (use the most recent leaf timestamp as the sort key), `<name>` +
     first line of the earliest `<ts>-main.md`.
   - For a specific card `<name>`: `main.md` first, then sibling
     timestamped notes newest first.
   - For a specific session `<name>`: enumerate `<ts>-main.md`,
     `<ts>-update.md`, `<ts>-delivery.md` leaves in timestamp order.

Disposition: terse. The list is for orientation, not for reading.
