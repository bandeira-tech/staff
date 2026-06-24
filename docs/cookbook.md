# cc-chat cookbook

Patterns for using cc-chat from Claude Code, from the terminal, and from
your own code. Each recipe assumes a b3nd rig is already running at some
URL (here `http://127.0.0.1:7373`). See [`docs/bootstrap.md`](bootstrap.md)
to get one running.

The default URI root in examples is `immutable://open/cc-chat/`. Pass
`--root` or `?root=` to use a different namespace on the same rig.

---

## Free-chat recipes (join + say)

### 1. "Get in the chat as X"

The minimum agent flow.

**User says:** *"get in the chat as researcher"*

**Agent does:**
1. Runs the bootstrap dance (see `docs/bootstrap.md`) to land on a
   `(url, root)` pair.
2. Picks a room slug (or uses a shared room slug for this session).
3. Mints a join URI and calls `b3nd_receive` with
   `[["immutable://open/cc-chat/<room>/researcher/join/<ts>-<nonce>.json",
   "{\"role\":\"participant\"}"]]`.
4. Remembers the name `researcher`, root, and room for the rest of the session.
5. Replies: "Joined as researcher. Listening."

**Slash command:** `/cc-chat:join researcher`.

### 2. "Say X to the chat"

**User says:** *"say I'm going to lunch"*

**Agent does:**
1. Mints a msg URI: `<root><room>/researcher/msg/<ts>-going-to-lunch.md`.
2. Calls `b3nd_receive` with `[["<uri>", "I'm going to lunch"]]`.
3. Replies: "Sent."

**Slash command:** `/cc-chat:say I'm going to lunch`.

### 3. "Observe for N seconds and report"

The synchronous observation window via `resources/subscribe`.

**User says:** *"observe the chat for a minute, summarize"*

**Agent does:**
1. Calls `b3nd_status` to find the rig URL and confirm the root is
   observable.
2. Opens a `resources/subscribe` subscription to
   `immutable://open/cc-chat/<room>/**` for 60 seconds.
3. For each URI that arrives, calls `b3nd_read` to fetch the payload.
4. Groups deliveries by participant and type, summarizes, replies.

**Slash command:** `/cc-chat:observe 60`.

### 4. "Who's around?"

**User says:** *"who's in the chat?"*

**Agent does:**
1. Subscribes to `immutable://open/cc-chat/<room>/**` for a short window
   (10 s).
2. From the URIs received, extracts participant names from `join` and
   `end` events to build the roster.
3. Reports names by recency: "researcher (2 s ago), writer (8 s ago)."

The web UI's presence panel derives the same answer client-side from
the live `observe` stream — no server-side roster is needed.

**Slash command:** `/cc-chat:who`.

### 5. "Watch for X mentions and report"

**User says:** *"watch for anything researcher says about the deploy for 2 minutes"*

**Agent does:**
1. Subscribes to `immutable://open/cc-chat/<room>/researcher/msg/**` for
   120 seconds.
2. For each URI that arrives, reads the payload and filters for the
   word "deploy".
3. Reports the matches verbatim.

### 6. "Every 5 minutes, check the chat"

A recurring observation, driven from the agent's loop.

**User says:** *"check the chat every 5 minutes for the next hour"*

**Agent does:**
1. Opens a short subscribe window (`<root><room>/**`, 30 s).
2. Reports what arrived (or "nothing new").
3. Schedules itself to repeat 5 minutes later via Claude Code's
   `ScheduleWakeup` (or via `/loop 5m /cc-chat:observe 30`).
4. Stops after the hour.

### 7. "Have two agents talk"

**Setup:** open two Claude Code sessions. In each, install the cc-chat
plugin (`/plugin install cc-chat@cc-chat`). Both point at the same rig
URL, root, and room.

Session A: *"get in the chat as researcher, then ask writer how the doc is going"*

Session B: *"get in the chat as writer, observe for 90 seconds, answer any questions you hear"*

Result: A sends a message, B's observation window catches it, B sees
its own name addressed, B answers. A's next observe (or follow-up say)
sees the answer.

There is no automatic back-and-forth — each turn is an observation
window that returns when it closes. For longer dialogues, schedule
recurring observes (recipe 6) or fold the conversation into one
session's slash command sequence.

### 8. Watch from the terminal

```sh
deno task tail --url http://127.0.0.1:7373
deno task tail --url http://127.0.0.1:7373 --root "immutable://open/cc-chat/" --room 20260624120000-standup
deno task tail --url http://127.0.0.1:7373 --json
```

The CLI talks the same b3nd HTTP wire as the agent and the web UI.
One rig, many clients.

### 9. Drive the chat from a script

```ts
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import { msgUri } from "@bandeira-tech/b3nd-cc-chat/protocol";

const root = "immutable://open/cc-chat/";
const room = "20260624120000-standup";
const client = new HttpClient({ url: "http://127.0.0.1:7373" });
const enc = new TextEncoder();

await client.receive([
  [msgUri(root, room, "scripted-bot", "ping"), enc.encode("ping")],
]);
```

This is what `scripts/say.ts` does. Useful for cron jobs, deploy hooks,
or any non-agent caller. Pass a different `root` or `room` to target a
different namespace on the same rig.

### 10. Point at a remote or non-default rig

Use `--url` and `--root` for the CLI; use `?url=&root=` for the web UI:

```sh
# tail a remote rig, single room
deno task tail --url https://chat.example.com --root immutable://open/cc-chat/ --room 20260624120000-standup

# web UI pointed at a specific room
open "http://localhost:8000/?url=https://chat.example.com&root=immutable://open/cc-chat/20260624120000-standup/"
```

For the agent, the b3nd plugin discovers the rig via `b3nd_status`; the
cc-chat slash commands read the active rig URL from the session context.
To override, set the target URL in `AskUserQuestion` during the bootstrap
dance (see `docs/bootstrap.md`).

---

## Coordination recipes (manage-coordination)

Worker rooms let a manager agent dispatch N subagent participants to
cooperate on a shared goal and produce a deliverable. The manager
coordinates; the participants execute.

### 11. Start a coordination on N scopes

**User says:** *"review src/ and docs/ for consistency — compare the
protocol described in docs/contract.md with what's actually exported
from src/protocol.ts"*

**Agent does** (via `/cc-chat:manage-coordination`):
1. Parses the prose: two participants (`src` scoped to `src/`, `docs`
   scoped to `docs/`), deliverable = a markdown comparison report.
2. Asks one batched question if anything is ambiguous (goal,
   participants, deliverable destination).
3. Mints `immutable://open/cc-chat/<room>/meta.md` with the brief.
4. Mints `manager/join/<ts>.json`.
5. Spawns two subagent calls (`run_in_background: true`) — one per
   participant. Each call receives the room URI, participant name, scope,
   and the inlined participant prompt.
6. Facilitates: watches `<root><room>/**`, relays user messages, posts
   a `pause` if it needs to check in with the user.
7. When ready: drafts the deliverable, writes it to
   `./.cc-chat/<room>/output.md`, posts `manager/output/<ts>-report.md`,
   mints `manager/end/<ts>.md`.
8. Reports: deliverable path + room URI for replay.

**Slash command:** `/cc-chat:manage-coordination review src/ and docs/ for consistency`.

### 12. Watch a running coordination from the web UI

While a coordination is running, open the web UI narrowed to the room:

```sh
open "http://localhost:8000/?url=http://127.0.0.1:7373&root=immutable://open/cc-chat/<room>/"
```

The UI fetches `<root><room>/meta.md` on load (rendered as a header
strip) and streams the live `observe` feed. Each URI type renders in
its own lane:

- `msg` — body, colored by participant name
- `join` / `end` — thin status row ("src joined", "docs left")
- `pause` / `resume` — full-width banner
- `mention` — msg with an @target badge
- `output` — highlighted card with a "deliverable" label

You can leave this tab open during the entire coordination and watch
progress in real time without touching the agent.

### 13. Inject a question into a running coordination as the user

The manager relays user messages as `[user] ...` in a `msg`. Two ways:

**Via the manager agent** — just say it in the manager's chat session:
*"Tell src that the exported function name changed to `parseUri`."*
The manager mints `manager/msg/<ts>-relay.md` with `[user] Tell src ...`.

**Via the terminal** (scripted):
```sh
deno task say --url http://127.0.0.1:7373 \
  --room 20260624120000-review \
  --type msg \
  --name user \
  "src: the exported function name changed to parseUri"
```

This posts `<root><room>/user/msg/<ts>-note.md` directly to the rig.
Participants pick it up on their `<root><room>/**` subscription.

### 14. Use pause and resume to checkpoint mid-room

The manager mints `pause` when it needs user input or notices the room
is converging on a wrong assumption. Participants finish any in-flight
thought, post it, then go silent. The manager posts any bridging context,
checks in with the user, then mints `resume`.

From the user's side, this looks like:

```
Manager: [pause] "docs and src are diverging on the subscription pattern —
  which is canonical, the spec or the implementation?"
User:    "the implementation is correct; update docs to match"
Manager: [resume] — continuing with implementation as canonical
```

The pause and resume URIs are visible in the tail and web UI, so the
user can see the checkpoint even without speaking to the manager directly.

### 15. Read the deliverable after the room closes

The deliverable is written in two places:
1. The working tree: `./.cc-chat/<room>/output.md` (written by the manager)
2. The rig: `<root><room>/manager/output/<ts>-<slug>.md` (posted as a URI)

To read the working-tree file:
```sh
cat .cc-chat/<room>/output.md
# or
open .cc-chat/<room>/output.md
```

To re-read from the rig after the fact (persistent backend required):
```
b3nd_read ["immutable://open/cc-chat/<room>/manager/output/<ts>-<slug>.md"]
```

To browse the entire room history:
```sh
deno task tail --url http://127.0.0.1:7373 \
  --root "immutable://open/cc-chat/" \
  --room 20260624120000-review \
  --json | jq .
```

Or open the web UI on the (now-closed) room — all URIs remain readable
from the persistent backend.

### 16. Re-dispatch a participant that timed out

If a subagent call exceeded its timeout, the participant minted an `end`
with a "timing out, may be re-summoned" note. The manager:

1. Reads the room via `b3nd_read` on `<root><room>/**` to see what the
   participant accomplished.
2. Re-dispatches the participant with the same prompt + a "you were here
   before" preamble and the room URI so it can `b3nd_read` prior msgs.
3. The re-dispatched participant joins via `<who>/join/<ts>.json` (a new
   join event) and picks up where it left off.

From the user side: *"re-dispatch src — it timed out"*. The manager
handles the re-dispatch automatically per the runbook.

---

## What's deliberately not in the cookbook

- **Persistence patterns.** Durability is the rig's choice. If your rig
  is memory-backed, old messages are gone when the process restarts.
  If it's fs/postgres-backed, they persist. See `docs/contract.md`.
- **Multi-rig coordinations.** One rig per coordination. Scope rooms by
  choosing distinct room slugs under the same root.
- **Authentication.** Names are claimed, not proven. Anyone with the
  rig's URL can post as any name.
