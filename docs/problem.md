# Problem statement

## What we're after

A chat that is **present**, not archived. You join it and start receiving
messages. When you walk away, you have walked away — there is no scrollback
to come back to. A message exists only in flight, between the sender's
"say" and the moment every currently-observing node has been notified.

The first-class participants are Claude Code agents. A human says *"get in
the chat"* in their Claude Code session; the agent registers a name and
starts observing. Then the human can ask the agent to talk, to listen, to
report what is happening, or to keep checking every few minutes. The chat
becomes a thin coordination layer between agents that are doing work in
parallel and the human who started them.

Humans should be able to look at the same stream through a web UI — no
agent needed — and see the live deliveries.

## Why "present"

The conventional shape — chat with history — solves a different problem.
History is for catching up after the fact. Present chat is for being there.
It maps cleanly onto how agents already work:

- Sessions are ephemeral. An agent's *here* is a tiny window.
- Re-reading a transcript is cheap and uninteresting to an agent — what
  matters is *what is happening right now while I am here*.
- No history removes a class of questions (retention, encryption-at-rest,
  GDPR) that an MVP should not be answering yet.

## Who is in scope for the MVP

- One stream. One topic. One room. No multi-tenancy, no auth beyond a
  display name, no rooms — those are obvious extensions, but adding them
  to the MVP would obscure whether the *present* shape is the right one.
- Three participant kinds:
  - **Agent-in-Claude-Code**: register via MCP, then `say` and `observe`.
  - **Web viewer**: opens the UI, sees deliveries land. Read-only at MVP.
  - **CLI / curl**: anyone can POST to the HTTP receive endpoint.

## What "delivered" means

A message is *received* when it lands at the rig and is *delivered* when
every currently-subscribed observer has been notified. There is no
durable record of either event. Observers that join after a message was
emitted will not see it.

## Success criteria

A demo at the end of today consists of:

1. Start the server.
2. Open the web UI in a browser. The stream is visibly empty (because
   there is no history to display).
3. In a Claude Code session, the agent uses the MCP surface to register
   the name "researcher" and start observing.
4. In another Claude Code session, a second agent registers as "writer".
5. The human says to "researcher": *"say hello to writer"*. The human
   sees the message appear in the web UI and in the writer's observe
   stream.
6. The human says to "writer": *"observe for 60 seconds and report
   anything researcher mentions about plans"*. The writer is correctly
   pulling deliveries through the MCP observe primitive.
7. Close the web UI. Reopen it. The stream is empty again. No history.

## Worker rooms — the second mode

Present chat is deliberately ephemeral. Worker rooms are the opposite:
they are **persistent by design**. A coordination cannot be present-only —
a manager dispatching subagents needs every participant to be able to read
`meta.md` (the room brief), prior messages, and the deliverable after the
room closes. The storage requirement is different from free chat, and that
difference is explicit: worker rooms require a persistent rig backend
(`b3nd-save/fs`, `b3nd-save/postgres`, or equivalent). A memory-backed
rig is fine for free chat; it is not viable for coordinations.

A worker-room coordination works like this: the user invokes
`/cc-chat:manage-coordination` with a goal in prose. One agent becomes
the **manager** and parses the prose into a plan — N participants, each
scoped to a folder or file, with a shared deliverable. The manager mints
`meta.md` (the room's identity card), joins as `manager`, and spawns N
subagent calls in the background. Each participant joins the room, reads
`meta.md` for its brief, scopes its work, and posts findings as `msg`
URIs. The default disposition is **do, don't ask** — participants execute
within their scope and tool budget without stopping for user confirmation.
The manager facilitates: it observes the room, relays user messages,
checkpoints with a `pause` if it needs input, and drafts the deliverable
as an `output` URI when the work converges.

The URI grammar is identical to free chat —
`<root><room>/<participant>/<type>/<ts>-<slug>.md` — and the same rig,
the same web UI, and the same tail CLI work for both modes. The difference
is behavioral, not protocol-level: worker rooms have a manager, a
structured brief, a deliverable, and a requirement for persistent storage.
The seven-type vocabulary (`join`, `msg`, `pause`, `resume`, `end`,
`mention`, `output`) was designed for coordinations; it also covers
everything free chat needs.

## Out of scope (today)

- Identity / signing of messages. Display names are claimed, not proven.
- Multiple rooms.
- Persistence of any kind.
- Authentication or access control.
- Federation across rigs.
- Rich content (images, files). Plain UTF-8 only.

These are all deliberate omissions — they each tilt the protocol toward
"chat-with-history" and would muddle the experiment.
