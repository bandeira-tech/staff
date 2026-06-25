# Session scripts — what I've been hand-rolling and why

This is the catalog of one-off scripts I created in this session (mostly under
`/tmp/`) to drive the smoke rig and the cc-chat coordination flow when the
"canonical" tools weren't reachable. Each entry includes **what it does**,
**why I needed it**, and **what a longer-term home for the capability could
look like**.

---

## 1. `/tmp/post-uri.ts` — raw URI poster

**Does.** Reads a payload from a file (or stdin), encodes it via the
`bytes-list` codec (`<u32 BE len><bytes>` per slot), and POSTs to
`/api/v1/receive?u=<b64>` against the local smoke rig.

**Why.** I needed to mint `meta.md`, manager `join`, and other one-off URIs
without going through MCP (taskwatch MCP doesn't carry the cc-chat root) and
without depending on `src/client.ts` (which imports `@bandeira-tech/b3nd-move/
http/client` — a subpath that isn't in this repo's import map). `scripts/say.ts`
works for `msg`/`join`/`mention`/`pause`/`resume`/`end`/`output`, but doesn't
support arbitrary URIs (notably `meta.md`).

**Long-term home.** Two cleanups, both small:

- `scripts/say.ts` adds a `--type meta` mode (mints `<root><room>/meta.md`
  from a payload file). Then nothing custom is needed for the manager flow.
- `scripts/post.ts` (or `bnd send` in b3nd-cli) — a generic "POST any URI"
  CLI, accepting `--uri` + payload from file/stdin. Useful any time you want
  raw-wire receive without an MCP or schema layer.

The `src/client.ts` import that breaks bare `deno run` is also a small
fixup — the import map needs a `@bandeira-tech/b3nd-move/http/client` entry
or the client should import via the package root.

---

## 2. `/tmp/room-cat.ts` — room replay via fan-out

**Does.** Reads `meta.md`, parses `participants` from frontmatter, then issues
a `read("<root><room>/<who>/<type>/?fn=ls&format=uris")` per who × type (plus
per who × target for mentions), collects all leaves, sorts by the `<ts>`
segment, batch-reads payloads, prints each `=== <uri> === / <payload>` block.

**Why.** This is exactly what `web/app.js#loadHistory` does, but as a CLI
so participant subagents can read the room state-so-far before posting their
own contribution. Today the protocol has no "read whole room in one call,"
so each consumer (web UI, subagent, CLI) is recreating the same fan-out by
hand.

**Long-term home.** Two layers:

- **Underneath:** the recursive listing capability this coordination is
  designing — a `read("<root><room>/?fn=find&format=uris")` (or whichever
  shape we agree on) so the fan-out collapses to one call against any
  store that advertises support.
- **On top:** a `scripts/room-cat.ts` checked into cc-chat that uses the
  new capability when available and falls back to the participants-fan-out
  when not. Same shape we already have in `loadHistory`, lifted into a
  reusable script.

If we don't ship the underlying capability, this script (and `loadHistory`'s
fan-out) is the lasting workaround. It works, but every cc-chat-like
deep-tree consumer would have to invent its own.

---

## 3. `/tmp/mint-meta.ts` — typed `ccChatClient` one-shot poster

**Does.** Imports `ccChatClient` from `src/client.ts`, calls
`client.receive([{ uri, payload }])`. One URI per invocation.

**Why.** First attempt at minting `meta.md`. Failed because of the
`@bandeira-tech/b3nd-move/http/client` import resolution issue (above);
I fell back to `/tmp/post-uri.ts`.

**Long-term home.** Delete in favor of `scripts/say.ts --type meta` once
the type set is extended (see #1). The intent is reasonable but it's better
to extend the existing CLI than to ship another one-off.

---

## 4. `/tmp/meta-body.md` and `/tmp/join-payload.json` — payload files

**Are.** Just the bytes I wanted to receive. `meta-body.md` is the room's
identity card (goal, participants, deliverable). `join-payload.json` is
`{"role":"manager"}`.

**Long-term home.** These are inputs to the wire, not scripts — they don't
need a permanent place. The bigger question is whether the manager flow
should embed `meta.md` minting inside `/cc-chat:manage-coordination` itself
(it already does conceptually — see `plugin/commands/manage-coordination.md`
Step 3) so a manager run produces meta.md atomically without me wrangling
files.

---

## 5. Earlier session — already deleted

These all served the markdown/history work and got cleaned up after each
sub-task. Recording them here for completeness.

- **`/tmp/seed.ts`** — test-data seeder for a "finished" demo room. Used
  the raw HTTP wire (same pattern as `post-uri.ts`) to mint 8 records for
  the history-replay screenshot test.
- **`/tmp/probe-ls.ts`** — single-URL wire probe to confirm
  `?fn=ls&format=uris` works end-to-end through the b3nd HTTP read.
  Validated my understanding of the outputs-frame codec before wiring it
  into the UI.
- **`/tmp/md-test.mjs` and `/tmp/md-test2.mjs`** — Node unit tests for
  `renderMarkdown` (extracted the function from `web/app.js`, ran fixtures).
  Faster than spinning up a browser for each regex tweak.
- **`/tmp/replace-md.py`** — Python regex-replace of the `renderMarkdown`
  block in `web/app.js`. Needed because the previous version of the
  function used `\x00` (NUL) byte sentinels which the `Edit` tool can't
  match via its plain-text `old_string` argument. A real test harness for
  cc-chat would skip this kind of dance.

**Long-term home.** A small test harness — `tests/markdown_test.ts` exercising
`renderMarkdown` against fixtures — kills `/tmp/md-test*.mjs`. Seeder logic
belongs in `tests/fixtures/` or in a `scripts/seed-demo-room.ts` if the
smoke rig should ship example data.

---

## The patterns I keep retyping

Reading this list, three primitives keep showing up:

1. **Encode a url-list + bytes-list and POST to a wire endpoint.**
   Every script that talks to the rig redoes this. `b3nd-move` has the
   codecs; what's missing is a small Deno/Node CLI binding that exposes
   them at the shell level (`bnd send <uri> <payload>`, `bnd read <uri>...`,
   `bnd ls <prefix>`, `bnd find <prefix>`). `b3nd-cli` is the right home —
   if `bnd` already does this end-to-end against a configured target, the
   `/tmp/*` chaff goes away.

2. **Enumerate a deep URI tree.** `room-cat.ts` is the third place I've
   written this loop (the others are `loadHistory` in `web/app.js` and the
   `b3nd_read` instruction in `manage-coordination.md` Step 9 — the latter
   currently can't be honored because `**` isn't a real verb anywhere).
   This is exactly what the spec we're designing in
   `20260625093437-listing-spec` should make obsolete.

3. **Manager bootstrap.** Mint meta + join + open UI + write ledger. Today
   the `/cc-chat:manage-coordination` command's prose says to do this; the
   actual minting requires the b3nd MCP or hand-rolled wire calls. A
   pre-built `scripts/coordination-bootstrap.ts` (or the command shelling
   out to it) would remove the ad-hoc step where I script the bytes-list
   encoding for `meta.md`.

If I had to pick one thing to lift first, it'd be #1 — a thin `bnd`-style
CLI that exposes `send/read/observe/ls/find` against the wire. With that
in place, both `room-cat.ts` and most of `post-uri.ts` disappear; the
manage-coordination prose becomes a sequence of shell commands that any
operator (or subagent) can run; and the gap between "what cc-chat protocol
docs assume" and "what an agent without MCP can actually do" closes.
