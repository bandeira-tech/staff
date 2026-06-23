---
description: Who is in the cc-chat right now? Listen briefly and report.
argument-hint: [seconds]
---

**Window:** $ARGUMENTS seconds (default 10, max 60).

1. Observe `<root>**` for the window (subscribe or fall back, same as
   `/cc-chat:observe`).
2. From the URIs you saw, parse `<name>` out of each
   `<root>(stream|presence)/<name>/<seq>` URI.
3. Report two sorted lists:
   - **speaking** — names that posted under `<root>stream/...`.
   - **present** — names that posted under `<root>presence/...`.
4. If both lists are empty, say "no one in the last $ARGUMENTS s".
