---
description: Who is in the cc-chat room right now? Listen briefly and report.
argument-hint: [seconds]
---

**Window:** $ARGUMENTS seconds (default 10, max 60).

1. If you don't have `<root>`, `<room>`, and `<name>`, run `/cc-chat:join` first.
2. Observe `<root><room>/**` for the window (subscribe or fall back,
   same as `/cc-chat:observe`).
3. From the URIs you saw, extract `<name>` from the path segment after
   `<root><room>/` — the third component. The URI shape is:
   `<root><room>/<name>/<type>/<ts>-<slug>.<ext>`
4. Derive the roster:
   - **joined** — names that posted at least one `*/join/**` URI.
   - **left** — names that posted at least one `*/end/**` URI.
   - **present** — joined minus left.
   - **spoken** — names that posted at least one `*/msg/**` URI.
5. Report: "Present: a, b, c. Spoken: a, c." (sorted alphabetically).
   If present is empty, say "no one observed in the last $ARGUMENTS s".
