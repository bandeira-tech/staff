# STAFF pass 2 — the program (CLI), rig binding, and cast — design spec

> Ratified 2026-07-02. One-PR scope. Builds on the pass-1 spec
> (`2026-06-29-staff-mvp-design.md`) and the gate-oriented SKILL canon.
> Delivered as a single PR ("one big PR, one frame from the user
> standpoint").

## What this pass is

STAFF becomes a three-layer product, each layer complete without the one
below it:

```
┌─ Claude plugin (skill + commands) — standalone, prose-only, bare fs
│    └─ if `staff` CLI on PATH → the chief uses the program,
│       stops hand-rolling file ops
├─ staff CLI (@bandeira-tech/staff/cli) — add / promote / cast /
│    list / read / rig. Loads a rig in-process; bundled default rig
│    = FsStore at ~/.staff/fs
└─ b3nd rig — the same rig hosted by `bnd node <rig> --http --cors '*'`
     or `--mcp` when the builder wants atrium, cc-chat rooms, remote
     integration, or replication
```

The heading beyond this PR (context, not scope): durable sessions,
agents building context from work streams, dispatch from a web UI
(atrium, built in parallel at `~/ws/atrium`), team rooms fed by
ephemeral task streams. This PR lays the foundation those ride on:
`cast` + data-level rooms via cc-chat.

## Vocabulary (ratified renames)

- **add** — the capture verb (was `record` in early drafts).
- **cast** — the act of putting staff data to run (was `dispatch`/`run`).
- **players** — the roster component on teams, plays, and sessions
  (was `cast/` in the SKILL). Teams have players, plays have players;
  *cast* is reserved for the verb.

## Non-goals (this pass)

- No process supervision / daemonization of cast sessions. Durability
  comes from the brief (room observe loops), not a supervisor.
- No `staff serve` verb — `bnd node` (v0.5+, has `--cors`) hosts the rig.
- No web UI — atrium is the UI story, built in parallel.
- No room providers beyond cc-chat — rooms are URIs; other providers
  (e.g. Slack) are later URI schemes with their own interpreting plugins.
- No multi-spawn orchestration — one cast = one Claude Code session.
- No bundled data. The framework remains the product.

## The CLI — `@bandeira-tech/staff/cli`

Installed as:

```
deno install --global -A -n staff jsr:@bandeira-tech/staff/cli
```

### Verbs

```
staff add <kind> <name> [<prose>]              kind ∈ trait|role|play|team|staff
staff add gate <kind>/<name>/<gatename> [<prose>]
staff promote <kind> <name> [<ts>]
staff list <kind>
staff read <path>
staff cast play|role|trait|team …              (see Cast)
staff rig [<path|url>]
```

- **add** always writes a proposal — `proposal/{kind}/{name}/{ts}/main.md`,
  or `proposal/{kind}/{name}/{ts}/gates/{gatename}.md` for gates. Never
  canon. Prose comes from the trailing argument or stdin (`-` or a pipe)
  so agents can heredoc long bodies. Kind is singular everywhere on the
  command line — including the gate path (`staff add gate
  trait/skeptical/no-empty-promises`) and `with` refs (`role/lead-qa`) —
  and plural in the tree; the CLI maps.
- **promote** is the only verb that writes `canon/` — it materializes
  `canon/{kind}/{name}/` from a chosen proposal subtree. With `<ts>`
  omitted it lists the candidate proposals and takes the latest.
  Promotion stays an explicit builder act; agents propose, builders
  promote.
- **list** shows names under `canon/{kind}/` and marks names that have
  pending proposals. **read** fetches one path. Both go through the rig
  (`b3nd_read` semantics, `?fn=ls` for listings), so they see whatever
  backend the rig binds.
- **rig** mirrors `bnd config rig`: with no argument it shows the
  resolved rig, its data dir, and health; with an argument it persists
  the default rig.

### Rig resolution

```
1. --rig <path|url>          (per-invocation override)
2. $STAFF_RIG
3. configured default        (set via `staff rig <path>`)
4. bundled staff.rig.ts      (FsStore; data dir = $STAFF_DATA_DIR
                              or ~/.staff/fs)
```

The CLI loads the rig module in-process and drives its routes
(`receive`/`read`/`observe`) directly — no server required for any data
verb. Replication and remote backends are the user's rig's concern:
plug a different rig, nothing in the CLI changes.

Implementation note: at build time, check (per the b3nd relay protocol —
TARGETS.md, then JSR) whether `@bandeira-tech/b3nd-cli` exports its rig
resolution as an importable library. If yes, import it; if not,
hand-roll the small resolver here and record an UPSTREAM_GAP note, as
the rig file already does for other gaps.

### Errors

- Writes fail loud, naming the offending segment (bad name, bad kind,
  bad gate path). The convention's "malformed is invisible" rule applies
  to reads, not writes.
- Rig load failures surface an actionable message (which path was tried,
  why it failed) — never a raw deref TypeError (see atrium PAIN P1).
- `staff rig` doubles as the health check.
- Cast: a missing `claude` binary and unresolvable refs are actionable
  errors; unresolvable refs list near-matches and never silently invent.

## Cast — putting staff data to run

```
staff cast play <name> [with <ref>…] [--room <room>] [--session <name>] [-- <claude args>]
staff cast role <name> [<trait,trait…>]        [same options]
staff cast trait <trait[,trait…]>              [same options]
staff cast team <name>                         [same options]
```

**One cast = one Claude Code session.** The CLI:

1. **Resolves refs through the rig** — the named primitive plus any
   `with` refs (`role/lead-qa`, `trait/skeptical`). Canon first. A
   missing ref fails with near-matches listed.
2. **Writes the session record** — `sessions/{name}/{ts}-main.md`
   (name from `--session` or derived from the cast target): the brief
   as a manifest of *references* per the SKILL's dispatch discipline —
   refs, not copies — plus mode, players, and room if any.
3. **Spawns `claude`** with the brief injected via
   `--append-system-prompt`. Default is a new interactive shell.
   Everything after `--` passes through verbatim — `-- -p "…"
   --permission-mode acceptEdits` gives headless mode and params
   without the CLI growing its own flag zoo.

`cast team` composes the team plus its `players/` refs into one brief
for one chief-shaped session that recruits per the SKILL. Casting each
player as its own session into a shared room is the composable form:
`staff cast role <player-role> --room <room>` per player.

`cast --dry-run` prints the composed brief and the exact `claude`
invocation instead of exec'ing. This is the test seam and a debugging
tool.

### Rooms are data, not integrations

`--room <name>` writes a room *URI* into the brief — cc-chat's room
convention by default (cc-chat is part of the suite). The spawned
session's cc-chat plugin interprets it: join, observe, subscribe via
the b3nd MCP verbs. The CLI never speaks to the room itself. A future
Slack-backed room is a different URI scheme with its own interpreting
plugin; nothing in `cast` changes.

### Durability comes from the brief, not a daemon

A durable team-room agent is:

```
staff cast role dev --room team-x -- -p "join the room, observe, pick up work"
```

The session stays alive on cc-chat's observe loop; MCP subscription
means no redispatch. This addresses the two pain points of the
prose-only implementation: agents that can't communicate (they share a
room) and agents that can't persist (they observe instead of exiting).
Process supervision, ephemeral task streams feeding team rooms, and
web-UI dispatch build on this later — not in this PR.

## Protocol (`src/protocol.ts`)

Brought up to the SKILL's current grammar. Stays zero-dependency.

```
{root}canon/{kind}/{name}/main.md
{root}canon/{kind}/{name}/gates/{gate}.md
{root}canon/{kind}/{name}/players/{player}/role.ref
{root}canon/{kind}/{name}/players/{player}/gates/{gate}.md
{root}proposal/{kind}/{name}/{ts}/…            (same subtree shapes)
{root}sessions/{name}/{ts}-{main|update|delivery}.md
{root}sessions/{name}/players/{member}/{ts}-{main|update|delivery}.md
{root}sessions/{name}/gates/{gate}.md
{root}sessions/{name}/assets/…
```

- The six kinds stay first-class: traits, roles, plays, teams, staff,
  sessions.
- `players/` replaces `cast/` everywhere.
- Any subset of `main.md` / `gates/` / `players/` may be present on a
  primitive; prose-only is as legitimate as all-gates.
- Segments keep pass-1 grammar: `{name}` = `[a-z0-9][a-z0-9-]{0,47}`,
  `{ts}` = `YYYYMMDDhhmmss` UTC.
- Mint/parse/validate cover every shape above. Malformed URIs stay
  invisible on parse; mint helpers throw.

Under the rig, paths become URIs in the staff namespace
(`immutable://open/staff/…`), unchanged from pass 1.

## Plugin edits (deliberately light)

- **SKILL.md** — the `cast/` roster component renames to `players/`;
  a new short **The Program** section: on activation, check for `staff`
  on PATH — if present, the verb table maps to CLI invocations instead
  of hand-rolled file ops; bare-fs stays the documented fallback. The
  b3nd section stays as the level-up story.
- **commands/*.md** — same nine commands, language updated (players,
  CLI-when-present). The gate structure in `staff.md` is untouched.
- **plugin.json** — MCP entry stays (`bnd node <rig> --mcp` on stdio).
- **serve-http.ts** — deleted. `bnd node <rig> --http --cors '*'`
  (v0.5+) replaces it; docs point at `bnd node`. If finer-grained CORS
  config is wanted later, that ships in bnd (`--cors
  string_or_config_file`), not here.
- **site/index.html** — the install block gains the one-line CLI
  install next to the plugin install.

## Testing

- Protocol round-trips for every new shape (canon, proposal, gates,
  players, session grouping).
- CLI verbs tested against the bundled rig in-process with a temp
  `$STAFF_DATA_DIR`: add → list → read → promote round-trips through
  real b3nd verbs.
- Cast tested to the spawn boundary via `--dry-run` (brief composition,
  session record, exact invocation).
- `deno task test` stays the single entry.

## Execution shape (dogfooding)

Implementation runs as Chief of Staff operating STAFF itself:

- The staff skill is activated from this repo's plugin; a session is
  opened under the resolved root for the build.
- Implementation agents coordinate through a cc-chat room
  (`/cc-chat` manage-coordination), exercising the exact mechanics
  `cast --room` encodes.
- One branch, one PR carrying all layers of this spec.

## Concrete-API discipline

Per the b3nd skill: every concrete b3nd API, package name, export path,
and version used during implementation is verified against live sources
(TARGETS.md → JSR/GitHub) at implementation time. The versions pinned
in `staff.rig.ts` today are a starting point, not an answer.
