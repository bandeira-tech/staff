---
description: Run a play — follow a captured workflow end-to-end inside a session.
argument-hint: <play-name> [extra prose]
---

You are running a **play** from the STAFF convention. A run is a
**session** — open one, log updates as you go, mint a delivery at
the end.

## Steps

1. **Read the play's `main.md`.**
   - Pass 2: `b3nd_read([ "<root>plays/<name>/main.md" ])`.
   - MVP: read from disk at the user's configured staff root.
   If the play does not exist, surface that and stop.

2. **Open a session.**
   - Pick a session name (plain slug `[a-z0-9][a-z0-9-]{0,47}` derived
     from the play name or the user's prose).
   - Mint `<ts>-main.md` under that session name:
     ```
     b3nd_receive { messages: [[
       "<root>sessions/<name>/<ts>-main.md",
       "<session identity: goal, traits/roles/teams in effect, delivery shape>"
     ]] }
     ```
   - MVP: print the URI and the body; ask where to drop it on disk.

3. **Honor the phases.**
   Walk the phases in order. Treat phase headings as gates: pause and
   confirm with the user before moving on, unless the play body says
   otherwise.

4. **Append a `<ts>-update.md` per state change.**
   - Each update is a NEW timestamped file under the session name —
     not a rewrite of an existing one.
   - Pass 2: `b3nd_receive { messages: [[ "<root>sessions/<name>/<ts>-update.md", "<body>" ]] }`.
   - MVP: emit the line to the user (one update per phase transition,
     decision, blocker).

5. **Mint the delivery.**
   - Pass 2: mint `<root>sessions/<name>/<ts>-delivery.md` with the
     synthesis declared in the play's `Deliveries`.
   - MVP: print the delivery body.

Disposition: do, don't ask within a phase. Ask between phases. The play
is the authority for *what* — you bring the *how*.
