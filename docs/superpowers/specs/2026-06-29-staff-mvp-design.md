# STAFF MVP — design spec

> Ratified 2026-06-29. First-pass scope. Mirrors the shape of `b3nd-cc-chat`,
> adapted to the primitives in `programs/staff/README.md`.
>
> **Amendment 2026-06-29 (post-implementation):** `logs` dropped from the
> resource set; replaced by `sessions` with a richer three-leaf shape
> (`MAIN`, `LEDGER`, `REPORT`). The amendment is consolidated into the
> sections below — there is no "legacy logs" path in the shipped code.

## What STAFF is

A b3nd-native convention for the primitives a builder uses to organize
agentic operations: **staff** (chief-of-staff identity cards), **traits**
(atomic, composable steering bits), **plays** (reusable workflows), and a
**logs** stream. No bundled server. No bundled data. Rides any b3nd rig.

`positions/` and `teams/` segments are reserved in the URI grammar but
not minted by MVP commands. They land in a later pass.

## Non-goals (this pass)

- No bundled MCP rig (`.rig.ts`) wiring. The plugin scaffolding lands as
  prose; the MCP server entry stays unwired until pass 2.
- No web viewer (`web/`). Pass 2.
- No seed data of any kind. The product is the framework. User data
  lives wherever the user mounts the root.
- No tail/CLI scripts. Pass 2.

## Scope of this pass

1. URI convention with mint/parse/validate, fully tested.
2. Plugin skeleton: `plugin.json`, `marketplace.json`, one `SKILL.md`,
   command prose files (no MCP wiring yet).
3. Single-page install website (`site/index.html` + `styles.css`),
   produced by a dedicated design-led subagent so brand/visual decisions
   are made by the right authority. Destined for `staff.bandeira.tech`.
4. Standalone git repo at `programs/staff/` (matches `b3nd-cc-chat`
   pattern), Deno toolchain.

## The convention — URI grammar

Two shapes — **cards** and **sessions**.

### Cards (staff, traits, plays)

```
<root><card>/<name>/MAIN.md                    identity card / canonical body
<root><card>/<name>/<ts>-<slug>.md             sibling revision / note
```

Where `<card>` ∈ { `staff`, `traits`, `plays` }.

### Sessions

```
<root>sessions/<ts>-<session>/MAIN.md          session identity (minted once)
<root>sessions/<ts>-<session>/LEDGER.md        append-only journal
<root>sessions/<ts>-<session>/REPORT.md        final synthesis
```

`<ts>-<session>` is the session id (room-like, mirrors cc-chat's room
naming). Leaves are a closed set: `MAIN | LEDGER | REPORT`. No
free-form revisions under sessions in MVP — that's a pass-2 call once
the operational pattern shows itself.

### Root

`<root>` is **always injected by the caller**, never hard-coded. Every
mint helper takes `root` as its first argument. The plugin's default
injection (when no root is configured) is `immutable://open/staff/`.
This mirrors cc-chat's `requireRoot()` discipline.

`<root>` MUST:
- match `^[a-z][a-z0-9+.-]*://`
- end with `/`

### Segments

| Segment      | Grammar                              | Notes                                  |
|--------------|--------------------------------------|----------------------------------------|
| `<resource>` | `staff` \| `traits` \| `plays` \| `sessions` | closed MVP set (reserved: `positions`, `teams`) |
| `<card>`     | `staff` \| `traits` \| `plays`        | the card-shaped subset                 |
| `<name>`     | `[a-z0-9][a-z0-9-]{0,47}`            | card name                              |
| `<session>`  | `[a-z0-9][a-z0-9-]{0,47}`            | session slug component                 |
| `<ts>`       | `[0-9]{14}` (UTC `YYYYMMDDhhmmss`)   |                                        |
| `<slug>`     | `[a-z0-9][a-z0-9-]{0,47}`            | leaf slug for revisions                |
| session leaf | `MAIN` \| `LEDGER` \| `REPORT`        | closed set, all `.md`                  |
| `MAIN.md`    | literal                              | the canonical card; minted once       |

Malformed URIs are invisible (not noise), matching cc-chat semantics.

### Closed type set, conceptually

| Resource | What it is                                                    | Body shape                                |
|----------|---------------------------------------------------------------|-------------------------------------------|
| staff    | A named chief-of-staff persona the user is operating through  | markdown card                             |
| trait    | A focused, portable steering bit                              | markdown — one paragraph + cues           |
| play     | A reusable workflow with phases, gates, outputs               | markdown — phases, IO                     |
| session  | A bounded unit of work                                        | three leaves: MAIN (intent), LEDGER (journal), REPORT (synthesis) |

The grammar does not enforce body shape — bodies are markdown. The
plugin's skill teaches authoring conventions.

### Manager-only / reserved-for-later

Unlike cc-chat, STAFF has no manager type discipline in MVP. Reads and
writes are uniform across resources. When `positions` and `teams` land,
they may grow manager-only sub-types; that's a later spec.

## Module surface

`@bandeira-tech/staff` (when published) — initial exports:

- `./protocol` — `src/protocol.ts`. URI mint/parse/validate.
- `.` (mod) — `src/mod.ts`. Re-exports protocol.

Mint helpers:

```
mainUri(root, cardResource, name)             — <root><card>/<name>/MAIN.md
revisionUri(root, cardResource, name, slug, ts?) — <root><card>/<name>/<ts>-<slug>.md
mintSessionId(slug, ts?)                       — returns "<ts>-<slug>"
sessionUri(root, sessionId, leaf)              — <root>sessions/<sid>/<leaf>.md
```

`cardResource` is type-narrowed to `CardResource = "staff" | "traits" | "plays"`.
`sessions` is excluded from the card helpers; sessions have their own
shape.

Parsers / validators:

```
parseUri(root, uri): ParsedUri | null
validate(root, uri): void           — throws if invalid
isValidName(s), isValidSlug(s), isValidTs(s)
isValidResource(s), isValidCardResource(s)
isValidSessionId(s), isValidSessionLeaf(s)
RESOURCES, CARD_RESOURCES, RESERVED_RESOURCES, SESSION_LEAVES
formatTs(date), mintNonce()
```

`ParsedUri` is a discriminated union with variants
`main | revision | session`, each carrying parsed segments. Sessions
carry both the composite `sessionId` and the decomposed `ts` + `slug`.

The protocol module has **zero b3nd imports**. It's pure URI grammar.
This isolates it from b3nd version churn.

## File layout

```
programs/staff/
  README.md                       (the product spec — keep verbatim)
  LICENSE                         MIT
  .gitignore
  deno.json                       jsr name + exports + test task
  src/
    protocol.ts                   URI grammar
    mod.ts                        re-export
  tests/
    protocol_test.ts              every public surface covered
  plugin/
    .claude-plugin/
      plugin.json                 manifest (MCP wiring deferred to pass 2)
      marketplace.json
    skills/staff/SKILL.md         teaches the grammar + composition idea
    commands/                     prose commands (no MCP rig yet)
      capture-trait.md
      compose.md
      capture-play.md
      run-play.md
      list.md
  site/
    index.html                    single-page install for staff.bandeira.tech
    styles.css
  docs/
    superpowers/{specs,plans}/    this spec + the plan that follows
```

## Plugin behavior (prose-only in this pass)

The plugin ships skills and commands. With no MCP wiring yet, commands
describe the URI shapes they would mint/read; pass 2 wires the rig.

### Commands

- **capture-trait** — "capture _newbie_ as a trait for product designers".
  Distills the active context into a one-paragraph trait, would mint
  `<root>traits/<name>/MAIN.md` + a `logs/` entry. MVP: prose, no MCP.
- **compose** — "act with _newbie_ and _playful_". Reads N traits, folds
  them into the running agent's steering. Pure read.
- **capture-play / run-play** — symmetric for plays.
- **list** — directory listings via `b3nd_read?fn=ls` on the resource
  prefix.

### Skill (`skills/staff/SKILL.md`)

Teaches:
- Root injection discipline (root is always an argument, never assumed).
- The URI grammar and the closed resource set.
- How composition works conceptually (read traits → steer this session).
- Where the seam to b3nd MCP would land (forward reference to pass 2).

## Install site (`site/`)

Single page. Builder-aimed. Three principles above the fold (from
`tmp/staff_readme_original.md`). Install block with the install command
(specific text deferred to the design-led subagent; placeholder OK).

Produced by a dedicated subagent (general-purpose with a brief
referencing `programs/staff/README.md` and
`tmp/staff_readme_original.md`). The subagent is told:

- product design + visual design are its authority
- defer to bandeira.tech house cues if it can identify them; otherwise
  pick a clean builder aesthetic
- copy must read like the readme — direct, no marketing fluff
- target deploy: `staff.bandeira.tech` (single static page, no JS
  framework, vanilla HTML/CSS)

## Tech stack

- Deno 2.x toolchain (matches cc-chat).
- TypeScript strict.
- `@std/assert` for tests (matches cc-chat).
- No b3nd deps in `src/protocol.ts` (intentional).
- Pass 2 will add b3nd-core / move / save imports for the rig — those go
  through the relay protocol in `skills/b3nd/TARGETS.md` at that time.

## Open items for pass 2 (not this spec)

- The bundled rig (`plugin/.claude-plugin/staff.rig.ts`) with FsStore.
- MCP entry in `plugin.json` and the `staff-mcp.sh` launcher.
- Web viewer at `web/`.
- A first concrete play (`manage-coordination` is a likely seed, ported
  from cc-chat — but explicitly deferred per user direction; MVP ships
  no data).
- `positions/` and `teams/` URI segments.
