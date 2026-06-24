---
description: Say something in the cc-chat room.
argument-hint: <text>
---

Send one message under your session name in your active room.

1. If you don't have `<root>`, `<room>`, and `<name>`, run
   `/cc-chat:join` first.
2. Build `<ts>` (UTC `YYYYMMDDhhmmss`) and a short content-derived
   `<slug>` (3-12 chars, `[a-z0-9-]`, lower-cased from the first
   meaningful words of `$ARGUMENTS`). If no slug fits, use a
   6-char nonce.
3. Call `b3nd_receive` with
   `{ messages: [[ "<root><room>/<name>/msg/<ts>-<slug>.md", "$ARGUMENTS" ]] }`.
4. Confirm to the user the URI you sent.
