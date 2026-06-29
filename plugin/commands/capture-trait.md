---
description: Capture a trait — distill a focused, portable steering bit and mint it.
argument-hint: <prose: who/what>
---

You are capturing a **trait** in the STAFF convention.

A trait is short, atomic, and composable — one of the six STAFF
primitives alongside `roles`, `plays`, `teams`, `staff`, and
`sessions`. One paragraph + 2–4 cues.

## Steps

1. **Parse prose → trait shape.**
   From `$ARGUMENTS`, extract:
   - `<name>` — `[a-z0-9][a-z0-9-]{0,47}`. Derive from the prose
     ("the *newbie* trait" → `newbie`).
   - One-sentence definition.
   - 2–4 cues — short, specific, observable.

2. **Sketch the body.**
   ```
   A <noun> who <does what>.
   - <cue>
   - <cue>
   - <cue>
   ```

3. **Mint** (pass 2 — once MCP is wired):
   ```
   b3nd_receive { messages: [[ "<root>traits/<name>/main.md", "<body>" ]] }
   ```
   If you are inside a session, append the capture as a new update leaf
   on that session:
   ```
   b3nd_receive { messages: [[ "<root>sessions/<name>/<ts>-update.md",
                               "captured trait <name>" ]] }
   ```

4. **MVP fallback (no MCP yet):** print the URI you *would* mint and the
   body, and ask the user where to drop the markdown on disk. The
   product is the convention; the user chooses the storage seam.

Disposition: meet-them-where-they-are. If the prose is rough, sharpen
it lightly — don't enforce a starting point that isn't there. Don't
overfit a trait to the role or theme of the context where it surfaced.
