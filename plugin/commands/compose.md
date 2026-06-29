---
description: Compose with N traits (or roles) — read their bodies and fold them into the session as steering.
argument-hint: <prose: which traits / roles, in what role>
---

You are composing with one or more **traits** (and optionally
**roles**) from the STAFF convention. Traits are atomic steering
bits; roles are profile requirement shells. Both are first-class
primitives.

## Steps

1. **Parse prose → primitive references.**
   Names are `[a-z0-9][a-z0-9-]{0,47}`. Quoted (`_newbie_`) or italicized
   forms both count. Note whether each reference is a trait or a role
   (the user's prose usually disambiguates: "with the *newbie* trait",
   "as the *platform-client* role").

2. **Read each referenced body.**
   - Pass 2: `b3nd_read([ "<root>traits/<name>/main.md", "<root>roles/<name>/main.md", ... ])`.
   - MVP: read from the user's configured staff root on disk, or ask
     the user to paste them.

3. **Fold into your current behavior.**
   Treat each trait as additive steering and each role as a profile
   shell to fulfil for the rest of this session. Acknowledge briefly:
   *"acting with `newbie` and `playful`, fulfilling `platform-client`"*.
   Do not restate the bodies.

Pure read — no mints. Composition stacks: read in declaration order; if
two traits conflict, the latter wins.
