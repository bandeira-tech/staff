---
slug: product
summary: Phase-marker owner. Retired in board-stickers retro — the role's purpose turned out to be manager work in practice.
sourced_from:
  - 20260626090833-board-stickers
status: retired-with-note
version: 1
updated: 2026-06-26T22:14:35Z
---

## When to summon

**Don't, by default.** board-stickers tried this role and it was redundant: product was supposed to mint `PHASE-MARKER: concept-end` based on objective criteria (techlead+designer both posted ≥2 pitches; qa1+qa2 both posted rubric/matrix sketches), but exited prematurely with an "I'll wait" loop, and the manager filled in. The criteria were simple enough that the manager scored them in one read.

The retired-with-note status means: a future room can revive `product` IF and ONLY IF the phase-readiness scoring is too complex for the manager to absorb. Otherwise, keep these criteria in the manager's facilitate-loop step.

## Why it didn't work (from retro)

- **No tool to wait on.** Product had no event-driven trigger to mint the marker — the runtime is post-then-exit, and there's no within-Agent wait primitive for "all other participants posted". Product looped in their context and exited.
- **Criteria-scoring is cheap.** Manager can `room-cat.ts --ls` and check the four boxes in a single read. Adding a participant for this is overhead.
- **Manager already mints phase URIs** under runtime-coordination's proposal. No need for a separate seat.

## What to do instead

- Manager's facilitate-loop reads `room-cat.ts --ls <prefix>` after dispatching, scores phase-readiness directly, mints `manager/phase/<ts>-<slug>.md`.
- Bake the phase-readiness checklist into `manage-coordination.md` Step 6.

## When this might come back

If a room is large enough that multiple parallel phases run independently (e.g. 3 concurrent feature builds with separate phase boundaries each), a dedicated phase-coordinator role might earn its seat. Until then, retire.
