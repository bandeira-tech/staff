---
description: Run a play — follow a captured workflow end-to-end.
argument-hint: <play-name> [extra prose]
---

You are running a **play** from the STAFF convention.

## Steps

1. **Read the play's MAIN.md.**
   - Pass 2: `b3nd_read([ "<root>plays/<name>/MAIN.md" ])`.
   - MVP: read from disk at the user's configured staff root.
   If the play does not exist, surface that and stop.

2. **Honor the phases.**
   Walk the phases in order. Treat phase headings as gates: pause and
   confirm with the user before moving on, unless the play body says
   otherwise.

3. **Append a log entry per phase transition.**
   - Pass 2:
     ```
     b3nd_receive { messages: [[ "<root>logs/<ts>-play-<name>-<phase>.md",
                                 "entered phase <phase>" ]] }
     ```
   - MVP: just emit the line to the user.

4. **Produce the output declared in `Inputs / Outputs`.**
   Same shape: pass 2 mints it under `<root>plays/<name>/<ts>-output.md`;
   MVP prints it.

Disposition: do, don't ask within a phase. Ask between phases. The play
is the authority for *what* — you bring the *how*.
