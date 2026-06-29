---
description: List staff, traits, plays, or recent logs.
argument-hint: <resource> [name]
---

You are listing entries in the STAFF convention.

## Steps

1. **Parse `$ARGUMENTS`.**
   - `<resource>` ∈ { staff, traits, plays, logs } — closed set.
   - Optional `<name>` for revisions under a single entry.

2. **List.**
   - Pass 2:
     - all entries: `b3nd_read([ "<root><resource>/?fn=ls" ])`
     - revisions: `b3nd_read([ "<root><resource>/<name>/?fn=ls" ])`
   - MVP: directory list the configured staff root on disk.

3. **Render.**
   - For `staff` / `traits` / `plays`: one line per entry, `<name>` +
     first line of MAIN.md.
   - For `logs`: most recent 20, newest first, `<ts> <slug>`.
   - For a specific `<name>`: MAIN.md first, then revisions newest
     first.

Disposition: terse. The list is for orientation, not for reading.
