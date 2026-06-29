---
name: staff
description: Use when the user asks you to capture a trait, compose with traits, capture or run a play, open or close a session, list staff/traits/plays/sessions, or otherwise work in the STAFF by BANDEIRA.TECH convention. Teaches the URI grammar — a convention carried by any b3nd rig. MVP: prose only; MCP rig wiring lands in pass 2. URIs always take an injected `<root>`; default injection is `immutable://open/staff/` only when none is configured.
---

# staff — a convention over `bnd`

STAFF is a relative URI shape mounted under a root the operator chooses,
on a rig run by `bnd`. It ships **no server of its own**: when wired
(pass 2), everything goes through the standard b3nd MCP verbs
(`b3nd_receive`, `b3nd_read`, `resources/subscribe`, `b3nd_status`).

## Root injection

`<root>` is always passed in. The plugin's only default — applied if the
user has not configured anything else — is `immutable://open/staff/`.
Treat any code that hard-codes a root as a bug.

## URI grammar

Two shapes — cards and sessions.

**Cards** (staff, traits, plays):

```
<root><card>/<name>/MAIN.md                  canonical card
<root><card>/<name>/<ts>-<slug>.md           revision / note
```

**Sessions** — operational records of work that happened:

```
<root>sessions/<ts>-<session>/MAIN.md        session identity card (minted once)
<root>sessions/<ts>-<session>/LEDGER.md      append-only progress
<root>sessions/<ts>-<session>/REPORT.md      final deliverable / synthesis
```

Where:

- `<card>` ∈ { `staff`, `traits`, `plays` } — resources with a `MAIN.md`
  identity card and optional revisions.
- `sessions` is its own resource with three canonical leaves (closed
  set: `MAIN`, `LEDGER`, `REPORT`).
- `<name>` — `[a-z0-9][a-z0-9-]{0,47}`.
- `<ts>` — `YYYYMMDDhhmmss` UTC.
- `<session>` — `[a-z0-9][a-z0-9-]{0,47}` (combined with `<ts>` for the
  session id).
- `<slug>` — `[a-z0-9][a-z0-9-]{0,47}`.

`positions` and `teams` are reserved but not minted yet.

A malformed URI is invisible — the convention silently ignores it.

## The primitives

| Primitive | What it is                                                          |
|-----------|---------------------------------------------------------------------|
| staff     | A named chief-of-staff persona the user operates through            |
| trait     | A portable, atomic steering bit — short, focused, composable        |
| play      | A reusable workflow with phases, gates, and outputs                 |
| session   | A bounded unit of work — meta + ledger + report                     |

Trait body shape — one paragraph + cues:

```
A <noun> who <does what>.
- <cue>
- <cue>
- <cue>
```

Play body shape — phases, IO:

```
# Goal
<one sentence>

# Phases
1. <phase>
2. <phase>

# Inputs / Outputs
- in: …
- out: …
```

Session leaves:

- **MAIN.md** — minted once when the session opens. Identity card:
  goal, participants/staff, expected report shape. Never updated; new
  intent goes in `LEDGER.md`.
- **LEDGER.md** — append-only journal of what happened, phase
  transitions, decisions. One short line per state change.
- **REPORT.md** — the synthesis at the end. Produced by the runner of
  the play (or the user) when work concludes.

## Composition

`compose` reads N traits and folds them into the current session's
steering. Pure read — no mints. Use to act with a particular profile
for the duration of a task: *act with `newbie` and `playful`*.

## When MCP is wired (pass 2)

The mint table will look like:

| Verb              | Tool             | URI pattern                                                       |
|-------------------|------------------|-------------------------------------------------------------------|
| capture trait     | `b3nd_receive`   | `<root>traits/<name>/MAIN.md`                                     |
| edit trait        | `b3nd_receive`   | `<root>traits/<name>/<ts>-<slug>.md`                              |
| capture play      | `b3nd_receive`   | `<root>plays/<name>/MAIN.md`                                      |
| open session      | `b3nd_receive`   | `<root>sessions/<ts>-<session>/MAIN.md`                           |
| append to ledger  | `b3nd_receive`   | `<root>sessions/<ts>-<session>/LEDGER.md` *(append semantics)*    |
| publish report    | `b3nd_receive`   | `<root>sessions/<ts>-<session>/REPORT.md`                         |
| list              | `b3nd_read`      | `<root><resource>/?fn=ls`                                         |
| read              | `b3nd_read`      | any URI above                                                     |

Until then, the commands describe intent against the grammar without
calling MCP.
