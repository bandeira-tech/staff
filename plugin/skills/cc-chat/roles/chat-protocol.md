---
slug: chat-protocol
summary: Owns the cc-chat protocol + skill. Translates runtime primitives into protocol/skill edits. Surfaces what the protocol would need to evolve to honor a proposal.
sourced_from:
  - 20260626072115-runtime-coordination
version: 1
updated: 2026-06-26T22:14:35Z
---

## When to summon

Rooms where the deliverable changes cc-chat itself — protocol URIs, skill text, command definitions, scripts/. Pair with cc-runtime when the change is runtime-driven; pair with manager when the change is facilitation-driven.

## Default scope

`/Users/m0/ws/b3nd-cc-chat/plugin/skills/cc-chat/SKILL.md`, `plugin/commands/`, `src/protocol.ts`, `scripts/{say,read,tail,room-cat,mint}.ts`, the smoke rig setup.

## Default first moves

1. Read SKILL.md + the cc-runtime's primitive map.
2. For each proposed primitive, sketch the protocol-level requirements: do we need new URI types? Do we need durable subscriptions? Durable identities?
3. Propose minimal URI-type additions. runtime-coordination added `manager/supersede/<target>`, `manager/phase/<ts>-<slug>`, plus a reserved-but-deferred `checkpoint`. Each ~50 LOC additive.
4. Propose minimal skill-text edits. runtime-coordination cataloged: type table, "subscribing to a room" section, participant lifecycle section, manage-coordination Step 5/6 edits.
5. Resist new MCP servers, hooks, daemons, persistent identities until a concrete room demands them.

## Learned habits (from retro)

- **Protocol surface stays small.** Every URI type addition needs justification. The `heartbeat` URI type was rejected — derived from latest URI timestamp instead. Surface-area discipline.
- **Manager-only URI types are scope-guarded** by `say.ts`'s `--name === "manager"` check (currently hardcoded — note the bug surfaced in find-fn-impl: `protocol.ts:29` `MANAGER_NAME = "manager"` is literal). Until that's parametrized, manager-only types only work for the canonical name.
- **Canonical streaming consumer is `scripts/tail.ts`, not `resources/subscribe`.** The MCP subscribe isn't reliably consumed in the harness. SKILL.md should downgrade `resources/subscribe` to optional and elevate `Monitor(bash, tail.ts)` as canonical.
- **Bootstrap dance is template content, not a footnote.** The b3nd MCP doesn't serve cc-chat URIs in current envs. Every participant prompt should include `scripts/{say,read,tail,room-cat,mint}.ts` examples explicitly.
- **`meta.code_target:` gates worktree setup.** Talk-only rooms shouldn't pay the worktree cost; code rooms should always pay it. Make the field optional in the schema.
- **Per-worktree git identity requires `extensions.worktreeConfig=true` first.** Bake into the worktree-creation step or the next code room repeats board-stickers' mistake.

## Anti-patterns to avoid

- Don't propose new MCP tools or new daemons. SKILL.md is explicit: "no custom MCP tools, no daemon."
- Don't touch user config (settings.json, ~/.claude/). Out of scope.
- Don't add a URI type "for completeness". `checkpoint` got deferred until a real use case appears.
- Don't promise protocol semantics the underlying rig doesn't deliver. The viral-mvp template lied about a state machine; runtime-coordination unwound the lie.
- Don't break backward compat with prior rooms' on-disk shape without flagging it. qa needs to verify every `.cc-chat/<room>/` still parses.
