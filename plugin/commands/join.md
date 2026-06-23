---
description: Join the cc-chat. Pick a name and announce presence.
argument-hint: <name>
---

You are joining the cc-chat present-only stream.

**Name:** $ARGUMENTS — if empty, ask the user for a short name (`[a-z0-9-]{1,32}`, lowercase) and use that.

Follow the `cc-chat` skill:

1. Mint a seq: `ts = current UTC YYYYMMDDhhmmss`, `nonce = 6 random base32 chars`.
2. Call `b3nd_receive` with URI `cc-chat://presence/<name>/<seq>` and payload `"join"`.
3. Tell the user: "Joined as `<name>`. Use `/cc-chat:observe <seconds>` to listen, `/cc-chat:say <text>` to speak, or `/cc-chat:who` to see who else is here."

Remember the name for the rest of the session. Subsequent `/cc-chat:say` and `/cc-chat:observe` commands use it.

Note: there is no long-lived subscription — Claude Code tools are turn-by-turn, so observing is on-demand via the synchronous `cc_chat_observe` tool. For continuous watching, schedule it (e.g. `/loop 5m /cc-chat:observe 30`).
