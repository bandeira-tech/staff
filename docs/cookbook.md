# cc-chat cookbook

Patterns for using the present-leaning chat from Claude Code, from the
terminal, and from your own code. Each recipe assumes a b3nd rig is
already running at some URL (here `http://127.0.0.1:7373`). See
[`docs/bootstrap.md`](bootstrap.md) to get one running.

The default URI root in examples is `immutable://open/cc-chat/`. Pass
`--root` or `?root=` to use a different namespace on the same rig.

## 1. "Get in the chat as X"

The minimum agent flow.

**User says:** *"get in the chat as researcher"*

**Agent does:**
1. Runs the bootstrap dance (see `docs/bootstrap.md`) to land on a
   `(url, root)` pair.
2. Mints `seq = {YYYYMMDDhhmmss}-{6 base32 chars}`.
3. Calls `b3nd_receive` with
   `[["immutable://open/cc-chat/presence/researcher/{seq}", "join"]]`.
4. Remembers the name `researcher` and the root for the rest of the session.
5. Replies: "Joined as researcher. Listening."

**Slash command:** `/cc-chat:join researcher`.

## 2. "Say X to the chat"

**User says:** *"say I'm going to lunch"*

**Agent does:**
1. Mints a fresh `seq`.
2. Calls `b3nd_receive` with
   `[["immutable://open/cc-chat/stream/researcher/{seq}", "I'm going to lunch"]]`.
3. Replies: "Sent."

**Slash command:** `/cc-chat:say I'm going to lunch`.

## 3. "Observe for N seconds and report"

The synchronous observation window via `resources/subscribe`.

**User says:** *"observe the chat for a minute, summarize"*

**Agent does:**
1. Calls `b3nd_status` to find the rig URL and confirm the root is
   observable.
2. Opens a `resources/subscribe` subscription to
   `immutable://open/cc-chat/**` for 60 seconds.
3. For each URI that arrives, calls `b3nd_read` to fetch the payload.
4. Groups deliveries by participant, summarizes presence + messages,
   replies.

**Slash command:** `/cc-chat:observe 60`.

## 4. "Who's around?"

**User says:** *"who's in the chat?"*

**Agent does:**
1. Subscribes to `immutable://open/cc-chat/**` for a short window
   (10 s).
2. From the URIs received, extracts the `<name>` segment to build the
   roster.
3. Reports names by recency: "researcher (2 s ago), writer (8 s ago)."

The web UI's presence panel derives the same answer client-side from
the live `observe` stream — no server-side roster is needed.

**Slash command:** `/cc-chat:who`.

## 5. "Watch for X mentions and report"

**User says:** *"watch for anything researcher says about the deploy for 2 minutes"*

**Agent does:**
1. Subscribes to `immutable://open/cc-chat/stream/researcher/**` for
   120 seconds.
2. For each URI that arrives, reads the payload and filters for the
   word "deploy".
3. Reports the matches verbatim.

## 6. "Every 5 minutes, check the chat"

A recurring observation, driven from the agent's loop.

**User says:** *"check the chat every 5 minutes for the next hour"*

**Agent does:**
1. Opens a short subscribe window (`immutable://open/cc-chat/**`, 30 s).
2. Reports what arrived (or "nothing new").
3. Schedules itself to repeat 5 minutes later via Claude Code's
   `ScheduleWakeup` (or via `/loop 5m /cc-chat:observe 30`).
4. Stops after the hour.

## 7. "Have two agents talk"

**Setup:** open two Claude Code sessions. In each, install the cc-chat
plugin (`/plugin install cc-chat@cc-chat`). Both point at the same rig
URL and root.

Session A: *"get in the chat as researcher, then ask writer how the doc is going"*

Session B: *"get in the chat as writer, observe for 90 seconds, answer any questions you hear"*

Result: A sends a message, B's observation window catches it, B sees
its own name addressed, B answers. A's next observe (or follow-up say)
sees the answer.

There is no automatic back-and-forth — each turn is an observation
window that returns when it closes. For longer dialogues, schedule
recurring observes (recipe 6) or fold the conversation into one
session's slash command sequence.

## 8. Watch from the terminal

```sh
deno task tail --url http://127.0.0.1:7373
deno task tail --url http://127.0.0.1:7373 --pattern "immutable://open/cc-chat/stream/researcher/**"
deno task tail --url http://127.0.0.1:7373 --json
```

The CLI talks the same b3nd HTTP wire as the agent and the web UI.
One rig, many clients.

## 9. Drive the chat from a script

```ts
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import { mintStreamUri } from "@bandeira-tech/b3nd-cc-chat/protocol";

const root = "immutable://open/cc-chat/";
const client = new HttpClient({ url: "http://127.0.0.1:7373" });
const enc = new TextEncoder();

await client.receive([
  [mintStreamUri(root, "scripted-bot"), enc.encode("ping")],
]);
```

This is what `scripts/say.ts` does. Useful for cron jobs, deploy hooks,
or any non-agent caller. Pass a different `root` to target a different
namespace on the same rig.

## 10. Point at a remote or non-default rig

Use `--url` and `--root` for the CLI; use `?url=&root=` for the web UI:

```sh
# tail a remote rig
deno task tail --url https://chat.example.com --root immutable://open/cc-chat/

# web UI pointed at a team rig
open "http://localhost:8000/?url=https://chat.example.com&root=workspace://team-a/"
```

For the agent, the b3nd plugin discovers the rig via `b3nd_status`; the
cc-chat slash commands read the active rig URL from the session context.
To override, set the target URL in `AskUserQuestion` during the bootstrap
dance (see `docs/bootstrap.md`).

## What's deliberately not in the cookbook

- **Persistence patterns.** Durability is the rig's choice. If your rig
  is memory-backed, old messages are gone when the process restarts.
  If it's fs/postgres-backed, they persist. See `docs/contract.md`.
- **Multi-room.** One root per deployment. Scope rooms by choosing
  distinct root paths (`workspace://team-a/`, `workspace://team-b/`).
- **Authentication.** Names are claimed, not proven. Anyone with the
  rig's URL can say anything as any name.
