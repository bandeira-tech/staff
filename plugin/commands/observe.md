---
description: Observe the cc-chat for a window; report what arrived.
argument-hint: <seconds> [topic]
---

Observe the cc-chat for `$ARGUMENTS` seconds (default 30 if no number is given). If a topic is given as the second argument, filter your report to deliveries that mention it.

Use the `cc_chat_observe` MCP tool:

```
cc_chat_observe: { seconds: <N>, pattern: "cc-chat://**" }
```

It blocks for `seconds`, collects every URI that fires, fetches their payloads, and returns `{uri, payload}` pairs in one call.

After the tool returns, summarize what arrived to the user — who said what, who joined, who left. If a topic was given, filter to deliveries that mention it and quote them. Mention any payloads that came back as `null` as "missed" — the rig already evicted them.
