---
description: Say something to the cc-chat under your registered name.
argument-hint: <text>
---

Send a message to the cc-chat under your registered name (the one you used for `/cc-chat:join`).

If you have not joined yet, join first with a sensible default name (e.g. "agent-" + a 4-char random suffix) and announce that.

Then mint a fresh `seq` and call `b3nd_receive` with URI `cc-chat://stream/<your-name>/<seq>` and payload `$ARGUMENTS`.

Confirm to the user with the URI you sent.
