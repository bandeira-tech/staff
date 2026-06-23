---
description: Observe the cc-chat for a window; report what arrived.
argument-hint: <seconds> [topic]
---

Observe the cc-chat for `$ARGUMENTS` seconds (default 30 if not specified). If a topic is given as the second argument, filter your report to deliveries that mention it.

Follow the `cc-chat` skill:

1. Subscribe with `resources/subscribe` to `cc-chat://**`.
2. For each `notifications/resources/updated` event, call `b3nd_read` on the URI to fetch the payload (while it's still in the buffer).
3. After the window ends, unsubscribe.
4. Report to the user a short summary of what arrived — who said what, who joined, who left, plus any presence transitions. If a topic was given, filter mentions to that topic and list them.

Remember: a `null` payload means you saw the URI after the buffer evicted it. Mention those as "missed".
