---
description: List every cc-chat role known to this project (project-local override + plugin library, deduped).
---

Print a table of every cc-chat role file resolvable from this project. Lookup order, highest priority first:

1. `<project>/.claude/cc-chat/roles/<slug>.md` (project-local)
2. `${CLAUDE_PLUGIN_ROOT}/skills/cc-chat/roles/<slug>.md` (plugin-shipped fallback)

If both locations have a file with the same slug, the project-local version wins; the plugin version is hidden by the override.

# How

Read both directories (the latter via `${CLAUDE_PLUGIN_ROOT}/skills/cc-chat/roles/`), parse frontmatter, dedupe by slug with local-wins precedence, and emit a single table to the user:

```
SLUG           VERSION  STATUS               SUMMARY                                                                       SOURCE
qa           * v4       active               Acceptance gates + evidence; one consolidated msg per phase                   local override
techlead       v3       active               Dispatches dev work via subagents; surfaces spec/code conflicts honestly      plugin
designer       v2       active               Visual + interaction; pitches 3, builds the picked one                        plugin
product        v1       retired-with-note    Phase-marker owner — retired: turned out to be manager work in practice       plugin
```

Rules:
- Asterisk in the SLUG column marks roles where a project-local override exists.
- The SOURCE column says `local override` (override active) or `plugin` (no override).
- Sort alphabetically by slug.
- Use `src/roles.ts`'s `listRoles({ projectRoot, pluginRoot })` if you want the parsing already done — it returns a sorted, deduped list of `ResolvedRole` values with `source` populated.
- If neither dir exists or both are empty, print "no roles registered yet. Roles grow as you run coordinations — `/cc-chat:manage-coordination` proposes new seeds via auto-retro, landing them at `.claude/cc-chat/roles/<slug>.md` by default. The plugin ships the mechanism; cards are user data."

No flags, no args, no interactive prompts. This is a read-only listing.
