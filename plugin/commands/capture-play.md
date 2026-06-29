---
description: Capture a play — a reusable workflow with phases, gates, and outputs.
argument-hint: <prose: goal, phases, expected output>
---

You are capturing a **play** in the STAFF convention.

A play is a reusable workflow. Phases, gates between them, expected
outputs at the end.

## Steps

1. **Parse prose → play shape.**
   - `<name>` — `[a-z0-9][a-z0-9-]{0,47}`. Derive from the goal.
   - Goal — one sentence.
   - Phases — 2–6, each one short imperative line.
   - Inputs and outputs.

2. **Sketch the body.**
   ```
   # Goal
   <one sentence>

   # Phases
   1. <phase>
   2. <phase>

   # Inputs / Outputs
   - in: <what the play needs>
   - out: <what the play produces>
   ```

3. **Mint** (pass 2):
   ```
   b3nd_receive { messages: [[ "<root>plays/<name>/MAIN.md", "<body>" ]] }
   ```
   If you are inside a session, append the capture to the session
   ledger.

4. **MVP fallback:** print the URI and body, ask the user where to
   drop it.

Disposition: a play earns its keep by running. If you cannot picture
the next time it will run, push back on capturing it.
