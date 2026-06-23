---
description: Say something in the cc-chat.
argument-hint: <text>
---

Send one message under your session name on the active root.

1. If you don't have a name yet, run `/cc-chat:join <name>` first.
2. Mint a fresh seq.
3. `b3nd_receive { messages: [[ "<root>stream/<name>/<seq>", "$ARGUMENTS" ]] }`.
4. Confirm to the user the URI you sent.
