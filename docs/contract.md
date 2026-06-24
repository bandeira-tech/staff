# The cc-chat convention

cc-chat is not a server. It is a convention agreed between **senders** and
**observers** that share a **target rig** and a **root path**.

## Root is operator-supplied

The **root path** is whatever URI prefix the operator mounts cc-chat at on
their rig. cc-chat itself has no scheme of its own. The same app code
runs unchanged under any of:

```
immutable://open/cc-chat/
chat://team-a/
workspace://abcd/
https://example.com/rooms/x/
```

`immutable://open/cc-chat/` is the **default root** — the bootstrap skill,
the web UI placeholder, and the scripts all default to it. It is not
part of the protocol. Operators pick the root that fits their namespace.

## URI grammar (unified shape)

One canonical shape under the chosen root:

```
<root><room>/<participant>/<type>/<ts>-<slug>.md
```

with one deliberate exception — the room's identity card:

```
<root><room>/meta.md
```

Segments:

- `<root>` — user-controlled rig namespace; default
  `immutable://open/cc-chat/`. Must end with `/`.
- `<room>` — `<ts>-<slug>` where `<ts>` is `YYYYMMDDhhmmss` UTC and
  `<slug>` is `[a-z0-9][a-z0-9-]{0,47}`.
- `<participant>` — `[a-z0-9][a-z0-9-]{0,31}`. The manager is always
  `manager`. Participant names default to scope-derived slugs (`src-auth`
  for `src/auth/`).
- `<type>` — closed set of seven: `join`, `msg`, `pause`, `resume`,
  `end`, `mention`, `output`.
- `<ts>-<slug>` — leaf; `<ts>` is the message's own UTC timestamp
  (14-char `YYYYMMDDhhmmss`), `<slug>` is content-derived or a 6-char
  base32 nonce. `.md` suffix on all types except `join`, which uses
  `.json`.

### Type vocabulary

| Type      | Path tail                                            | Payload                                 | Mintable by              |
|-----------|------------------------------------------------------|-----------------------------------------|--------------------------|
| `join`    | `<who>/join/<ts>-<nonce>.json`                       | `{"scope":"<path>","role":"<role>"}`    | anyone in room           |
| `msg`     | `<who>/msg/<ts>-<slug>.md`                           | markdown text                           | anyone in room           |
| `pause`   | `manager/pause/<ts>-<nonce>.md`                      | reason (one line)                       | manager only             |
| `resume`  | `manager/resume/<ts>-<nonce>.md`                     | empty or note                           | manager only             |
| `end`     | `<who>/end/<ts>-<nonce>.md`                          | empty or short leaving note             | manager (closes room); participants (leave) |
| `mention` | `<from>/mention/<target>/<ts>-<slug>.md`             | markdown text                           | anyone in room           |
| `output`  | `manager/output/<ts>-<slug>.md`                      | deliverable artifact (markdown default) | manager only             |

`validate(uri)` enforces alphabet, type-is-in-closed-set, and the
manager-only constraint for `pause`/`resume`/`output`/room-closing `end`.

### `meta.md` — deliberate exception

`<root><room>/meta.md` is the room's identity card. It is minted once by
the manager before anyone joins, never updated, and must remain readable
after the room closes. Late-joining participants and re-dispatched agents
read it to get their brief.

Shape: markdown with YAML frontmatter (room slug, created timestamp,
manager name, tool budget, deliverable spec, participant list, goal body).

## Persistent worker rooms

Rooms are **persistent worker rooms**, not ephemeral chat windows. The
default root `immutable://open/cc-chat/` is backed by a persistent rig
backend; `meta.md` and `output` posts must be readable by late-joining
participants and by the user after the room closes.

The older framing ("present-only, TTL-buffered, no archive") described a
demo deployment with a memory-backed rig. That is still a valid
cc-chat deployment, but it is no longer the stated default. Operators who
want ephemeral chat point at a memory rig; operators who want worker rooms
point at a persistent backend.

## Two modes of use

**Free chat** — `/cc-chat:join` + `/cc-chat:say`. Two or more agents (or
humans via the web UI) share a root and talk. No manager. Names are
claimed, not proven. Presence is self-reported via `join`/`end` events.

**Worker rooms** — `/cc-chat:manage-coordination`. One agent becomes the
**manager** and dispatches N subagent **participants**, each scoped to a
folder or file. The manager mints `meta.md`, coordinates, facilitates
pause/resume, and drafts the deliverable (`output`). Default disposition
for participants is *do, don't ask*.

## Subscription patterns

The single-subscription pattern is simplest and always correct:

```
<root><room>/**
```

Clients filter type-aware lanes client-side from the parsed URI. If the
rig MCP supports multi-glob, participants can narrow to:

```
<root><room>/*/msg/**            — messages from anyone
<root><room>/manager/pause/**    — control: pause
<root><room>/manager/resume/**   — control: resume
<root><room>/manager/end/**      — control: end
<root><room>/*/mention/<self>/** — being @-mentioned
<root><room>/*/join/**           — who's in the room
<root><room>/manager/output/**   — deliverable
```

The manager subscribes to `<root><room>/**` — everything.

## What the contract guarantees

- Anything posted under the root will route through the rig and be
  delivered to every observer whose subscription pattern matches.
- Payloads are plain UTF-8 text (markdown or JSON depending on type).
- The rig's persistence is the rig's business — the contract does not
  mandate it, but worker rooms assume it.

## `b3nd_receive` shape

The MCP tool call to post a URI:

```json
{ "messages": [[ "<uri>", "<payload>" ]] }
```

Multiple pairs in one call are delivered atomically as a batch.

## Liveliness is self-report

There is no server-side presence. A name appears "warm" because it just
spoke or joined. The UI and roster derive "who's around" from `join`/`end`
traffic and from recency of `msg` deliveries — not from any roster the
rig maintains.
