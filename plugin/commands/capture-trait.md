---
description: Capture a trait — distill a focused, portable steering bit and mint it.
argument-hint: <prose: who/what>
---

You are capturing a **trait** in the STAFF convention.

A trait is short, atomic, and composable — one of the six STAFF
primitives alongside `roles`, `plays`, `teams`, `staff`, and
`sessions`. One paragraph + 2–4 cues.

## Steps

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

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

3. **Communicate, then capture as proposal.**
   Surface what you'd capture and why before writing anything. Never
   write into `canon/` directly — promotion is the builder's call. If
   they want it persisted, write a proposal subtree at
   `<root>proposal/traits/<name>/<ts>/main.md` (the prose body — and
   add a `gates/` file beside it if a cue earns being an executable
   checkpoint; see the SKILL's "Gates and cast"). If a b3nd rig is
   wired, the equivalent is
   `b3nd_receive { messages: [[ "<root>proposal/traits/<name>/<ts>/main.md", "<body>" ]] }`.
   See the SKILL's "Proposals, not promotions".

4. **Optionally log inside a session.**
   If a session name was passed in alongside the trait capture, append
   the event as a new update leaf on that session:
   write `<root>sessions/<session-name>/<ts>-update.md` with body
   `captured trait <name>` (or the b3nd_receive equivalent on the
   same URI). If no session name was passed, skip this step — there
   is no stored "current session" to fall back on.

Disposition: meet-them-where-they-are. If the prose is rough, sharpen
it lightly — don't enforce a starting point that isn't there. Don't
overfit a trait to the role or theme of the context where it surfaced.

If the `staff` CLI is on PATH (`command -v staff`), perform this verb
through it (see the SKILL's *The Program* table) instead of hand-rolling
file operations — same root, same rig, grammar enforced.