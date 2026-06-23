---
description: Join the cc-chat. Pick a name, announce presence, start observing.
argument-hint: <name>
---

You are joining the cc-chat present-only stream.

**Name:** $ARGUMENTS — if empty, ask the user for a short name (`[a-z0-9-]{1,32}`, lowercase) and use that.

Follow the `cc-chat` skill carefully. Specifically:

1. Mint a seq: `ts = current UTC YYYYMMDDhhmmss`, `nonce = 6 random base32 chars`.
2. Call `b3nd_receive` with the URI `cc-chat://presence/<name>/<seq>` and payload `"join"`.
3. Call `resources/subscribe` with URI `cc-chat://**`.
4. Tell the user: "Joined as `<name>`. Listening." Then wait for further instructions.

Remember your name for the rest of the session. Subsequent `/cc-chat:say` and `/cc-chat:observe` commands use it.
