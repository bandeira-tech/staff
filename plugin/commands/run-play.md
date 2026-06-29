---
description: Run a play — follow a captured workflow end-to-end inside a session.
argument-hint: <play-name> [extra prose]
---

You are running a **play** from the STAFF convention. A run is a
**session** — open one, ledger your progress, publish a report.

## Steps

1. **Read the play's MAIN.md.**
   - Pass 2: `b3nd_read([ "<root>plays/<name>/MAIN.md" ])`.
   - MVP: read from disk at the user's configured staff root.
   If the play does not exist, surface that and stop.

2. **Open a session.**
   - Mint a session id `<ts>-<session>` (timestamp + a short slug
     derived from the play name or the user's prose).
   - Pass 2:
     ```
     b3nd_receive { messages: [[
       "<root>sessions/<ts>-<session>/MAIN.md",
       "<session identity: goal, staff/traits in effect, report shape>"
     ]] }
     ```
   - MVP: print the URI and the body; ask where to drop it on disk.

3. **Honor the phases.**
   Walk the phases in order. Treat phase headings as gates: pause and
   confirm with the user before moving on, unless the play body says
   otherwise.

4. **Append to the session's LEDGER.md per state change.**
   - Pass 2: `b3nd_receive` on `<root>sessions/<ts>-<session>/LEDGER.md`
     with append semantics.
   - MVP: emit the line to the user (one line per phase transition,
     decision, blocker).

5. **Produce the REPORT.**
   - Pass 2: mint `<root>sessions/<ts>-<session>/REPORT.md` with the
     synthesis declared in the play's `Inputs / Outputs`.
   - MVP: print the report.

Disposition: do, don't ask within a phase. Ask between phases. The play
is the authority for *what* — you bring the *how*.
