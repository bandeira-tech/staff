---
description: Run a play — follow a captured workflow end-to-end inside a session.
argument-hint: <play-name> [extra prose]
---

You are running a **play** from the STAFF convention. A run is a
**session** — open one, log updates as you go, mint a delivery at
the end.

## Steps

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

1. **Read the play from canon.**
   Read the play under `<root>canon/plays/<name>/` — its `main.md`
   prose body **and/or** `gates/*.md` (the play may be prose phases,
   gates, or both). If a b3nd rig is wired, the equivalent is
   `b3nd_read([ "<root>canon/plays/<name>/main.md", "<root>canon/plays/<name>/gates/?fn=ls" ])`.
   If the play does not exist under `canon/`, surface that and stop.

2. **Open a session — with resume-by-name discipline.**
   - Pick a session name (plain slug `[a-z0-9][a-z0-9-]{0,47}` derived
     from the play name or the user's prose).
   - List existing session directories under `<root>sessions/`. If
     the proposed name matches one exactly, resume by appending to
     it. If it looks similar to an existing one, disambiguate with
     the user before minting fresh — a typo silently forks the log.
   - Mint `<ts>-main.md` under the chosen name:
     write `<root>sessions/<name>/<ts>-main.md` with the session
     identity (goal, traits/roles/teams in effect, delivery shape).
     The b3nd rig equivalent is
     `b3nd_receive { messages: [[ "<root>sessions/<name>/<ts>-main.md", "<body>" ]] }`.

3. **Honor the phases.**
   Walk the phases in order. Treat phase headings as gates: pause and
   confirm with the user before moving on, unless the play body says
   otherwise.

4. **Append a `<ts>-update.md` per state change.**
   Each update is a NEW timestamped file under the session name — not
   a rewrite of an existing one. Write
   `<root>sessions/<name>/<ts>-update.md`; the b3nd rig equivalent is
   `b3nd_receive { messages: [[ "<root>sessions/<name>/<ts>-update.md", "<body>" ]] }`.
   One update per phase transition, decision, blocker.

5. **Recruit subagents with a URI manifest.**
   When dispatching subagents for a phase, hand them a manifest of
   URIs under the resolved root (session, role, play, traits) per
   the SKILL's "Dispatching Agents" section. Don't copy-paste
   bodies. For non-STAFF-aware agents, use the translate-for-non-STAFF
   fallback described there.

6. **Mint the delivery.**
   Write `<root>sessions/<name>/<ts>-delivery.md` with the synthesis
   declared in the play's `Deliveries`. The b3nd rig equivalent is
   `b3nd_receive { messages: [[ "<root>sessions/<name>/<ts>-delivery.md", "<synthesis>" ]] }`.

Disposition: do, don't ask within a phase. Ask between phases. The play
is the authority for *what* — you bring the *how*.

If the `staff` CLI is on PATH (`command -v staff`), perform this verb
through it (see the SKILL's *The Program* table) instead of hand-rolling
file operations — same root, same rig, grammar enforced.
