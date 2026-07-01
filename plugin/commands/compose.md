---
description: Compose with N traits (or roles) — read their bodies and fold them into the session as steering.
argument-hint: <prose: which traits / roles, in what role>
---

You are composing with one or more **traits** (and optionally
**roles**) from the STAFF convention. Traits are atomic steering
bits; roles are profile requirement shells. Both are first-class
primitives.

## Steps

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

1. **Parse prose → primitive references.**
   Names are `[a-z0-9][a-z0-9-]{0,47}`. Quoted (`_newbie_`) or italicized
   forms both count. Note whether each reference is a trait or a role
   (the user's prose usually disambiguates: "with the *newbie* trait",
   "as the *platform-client* role").

2. **Read each referenced body.**
   Read the canon primitive under `<root>canon/traits/<name>/` and
   `<root>canon/roles/<name>/` — a `main.md` prose body **and/or**
   `gates/*.md` (a primitive may be prose, gates, or both; read
   whichever are present). If a b3nd rig is wired, the equivalent is
   `b3nd_read([ "<root>canon/traits/<name>/main.md", "<root>canon/traits/<name>/gates/?fn=ls", "<root>canon/roles/<name>/main.md", ... ])`.

3. **Fold into your current behavior.**
   Treat each trait as additive steering and each role as a profile
   shell to fulfil for the rest of this session. Acknowledge briefly:
   *"acting with `newbie` and `playful`, fulfilling `platform-client`"*.
   Do not restate the bodies.

Pure read — no mints. Composition stacks: read in declaration order; if
two traits conflict, the latter wins.
