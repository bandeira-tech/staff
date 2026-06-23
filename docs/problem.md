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

## Out of scope (today)

- Identity / signing of messages. Display names are claimed, not proven.
- Multiple rooms.
- Persistence of any kind.
- Authentication or access control.
- Federation across rigs.
- Rich content (images, files). Plain UTF-8 only.

These are all deliberate omissions — they each tilt the protocol toward
"chat-with-history" and would muddle the experiment.
