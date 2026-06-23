---
description: Show who is in the cc-chat right now.
argument-hint: [seconds]
---

Call the `cc_chat_who` MCP tool with `{ seconds: $ARGUMENTS || 10 }`.

Report the names in three lines:
- **Here now:** `names` joined by ", " (or "no one" if empty).
- **Speaking:** `speaking` joined by ", " (or "no one" if empty).
- **Just signaling presence:** `presence` joined by ", " (or "no one" if empty).
