---
description: Compose with N traits — read trait bodies and fold them into the session as steering.
argument-hint: <prose: which traits, in what role>
---

You are composing with one or more **traits** from the STAFF convention.

## Steps

1. **Parse prose → trait names.**
   Names are `[a-z0-9][a-z0-9-]{0,47}`. Quoted (`_newbie_`) or italicized
   forms both count.

2. **Read each trait body.**
   - Pass 2: `b3nd_read([ "<root>traits/<name>/MAIN.md", ... ])`.
   - MVP: read from the user's configured staff root on disk, or ask
     the user to paste them.

3. **Fold into your current behavior.**
   Treat each trait as additive steering for the rest of this session.
   Acknowledge briefly: *"acting with `newbie` and `playful`"*. Do not
   restate the bodies.

Pure read — no mints. Composition stacks: read in declaration order; if
two traits conflict, the latter wins.
