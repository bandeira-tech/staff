---
description: Print the resolved role file for a slug after override lookup.
argument-hint: <slug>
---

**Slug:** `$ARGUMENTS`

Resolve the role file for `$ARGUMENTS` against the two-dir lookup chain:

1. `<project>/.claude/cc-chat/roles/<slug>.md` (project-local, highest priority)
2. `${CLAUDE_PLUGIN_ROOT}/skills/cc-chat/roles/<slug>.md` (plugin-shipped)

Use `src/roles.ts`'s `resolveRole(slug, { projectRoot, pluginRoot })` to do the lookup. If neither location holds the file:

```
no role file for "<slug>". Known roles: <comma-separated slugs from listRoles>.
Off-the-cuff dispatch still works — a role file is optional.
```

Otherwise print:

```
Resolved: <absolute path> (<source>)
Version:  v<n>    Updated: <iso>    Status: <active|retired-with-note>
Summary:  <one-line summary>
Sourced from: <comma-separated room slugs>

---
<verbatim body of the file>
```

Where `<source>` is `local override` or `plugin`. If `version`, `updated`, or `status` are unset in the frontmatter, omit those columns from the header instead of printing `undefined`.

For retired roles, prepend a one-line banner:

```
NOTE: this role is retired-with-note. Body is historical context, not active guidance.
```

No flags. One required positional arg.
