---
description: Close a session — synthesize a <ts>-delivery.md leaf.
argument-hint: <session-name> [extra prose for the synthesis]
---

You are closing a session in the STAFF convention by minting a
**delivery** leaf — `<ts>-delivery.md`. A session may have one or
more deliveries; closing is "the work earned a synthesis".

## Steps

0. **Resolve the root.**
   - `$STAFF_ROOT` if set (env override).
   - Otherwise, the nearest `.staff/` directory walking up from cwd.
   - Otherwise, `~/.staff/` (the encouraged default — data compounds
     across the builder's work).
   Lazily `mkdir -p` the resolved root if writing for the first time.
   Announce the resolved root on first use this turn.

1. **Resolve the session name.**
   The session name MUST be passed in — by the user, or by the
   dispatcher / chief calling this command. There is no stored
   "current session". If the name is missing, surface that there is
   nothing to close and stop: ask the caller to pass the session
   name.

2. **Read the session leaves.**
   `ls <root>sessions/<session-name>/` on disk, then read the
   `<ts>-main.md` and every `<ts>-update.md` in timestamp order. If a
   b3nd rig is wired, the equivalent is
   `b3nd_read([ "<root>sessions/<session-name>/?fn=ls" ])`.

3. **Synthesize the delivery body.**
   Match the *Delivery shape* declared in the session's earliest
   `<ts>-main.md`. Default skeleton:
   ```markdown
   # Outcome

   <one paragraph: was the goal met? to what extent?>

   # Decisions

   - <key decision from the updates>
   - …

   # Artifacts

   - <files written, URIs minted, links — absolute paths or URIs>

   # Open

   - <anything unresolved that the next session should pick up>
   ```

4. **Mint the delivery leaf.**
   Write the file at `<root>sessions/<session-name>/<ts>-delivery.md`.
   If a b3nd rig is wired, the equivalent is
   `b3nd_receive { messages: [[ "<root>sessions/<session-name>/<ts>-delivery.md", "<synthesis>" ]] }`.
   `<ts>` is fresh on every close.

5. **Report to the user:** session name, delivery URI, a 2-line
   summary, and any "Open" items that need a follow-up session.

Disposition: a session that doesn't produce a delivery failed to
close — flag that and either rerun the synthesis or mark it
unfinished explicitly.
