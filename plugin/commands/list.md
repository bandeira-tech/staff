---
description: List staff, traits, plays, or recent sessions.
argument-hint: <resource> [name]
---

You are listing entries in the STAFF convention.

## Steps

1. **Parse `$ARGUMENTS`.**
   - `<resource>` ∈ { staff, traits, plays, sessions } — closed set.
   - Optional `<name>` (or session id) for revisions / leaves under a
     single entry.

2. **List.**
   - Pass 2:
     - all entries: `b3nd_read([ "<root><resource>/?fn=ls" ])`
     - revisions under a card: `b3nd_read([ "<root><card>/<name>/?fn=ls" ])`
     - leaves of a session: `b3nd_read([ "<root>sessions/<sid>/?fn=ls" ])`
   - MVP: directory list the configured staff root on disk.

3. **Render.**
   - For `staff` / `traits` / `plays`: one line per entry, `<name>` +
     first line of MAIN.md.
   - For `sessions`: most recent 20, newest first, `<ts>-<session>` +
     first line of MAIN.md.
   - For a specific card `<name>`: MAIN.md first, then revisions newest
     first.
   - For a specific session id: MAIN.md, then LEDGER tail, then REPORT
     if present.

Disposition: terse. The list is for orientation, not for reading.
