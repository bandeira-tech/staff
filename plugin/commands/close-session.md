---
description: Close a session — synthesize a <ts>-delivery.md leaf.
argument-hint: [extra prose for the synthesis]
---

You are closing a session in the STAFF convention by minting a
**delivery** leaf — `<ts>-delivery.md`. A session may have one or
more deliveries; closing is "the work earned a synthesis".

## Steps

1. **Resolve the session name.**
   - We'll address active-session tracking once the design lands;
     for now expect the session name to be provided (by the user, or
     by the dispatcher / chief of staff calling this command).
   - If absent, surface that there is nothing to close and stop.

2. **Read the session leaves.**
   ```
   b3nd_read([ "<root>sessions/<session-name>/?fn=ls" ])
   ```
   then read the `<ts>-main.md` and every `<ts>-update.md` in
   timestamp order.

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
   ```
   b3nd_receive { messages: [[
     "<root>sessions/<session-name>/<ts>-delivery.md",
     "<synthesis>"
   ]] }
   ```
   `<ts>` is fresh on every close.

5. **Report to the user:** session name, delivery URI, a 2-line
   summary, and any "Open" items that need a follow-up session.

Disposition: a session that doesn't produce a delivery failed to
close — flag that and either rerun the synthesis or mark it
unfinished explicitly.
