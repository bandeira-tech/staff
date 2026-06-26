---
description: Open the cc-chat role file for a slug in $EDITOR. If only the plugin copy exists, prompt to fork into the project's .claude/cc-chat/roles/.
argument-hint: <slug>
---

**Slug:** `$ARGUMENTS`

Open the role file for `$ARGUMENTS` for editing. Two cases:

# Case 1 — Project-local override already exists

If `<project>/.claude/cc-chat/roles/<slug>.md` is present, open it directly:

```bash
${EDITOR:-vi} "<project>/.claude/cc-chat/roles/<slug>.md"
```

Per CLAUDE.md, also `open` it so the user sees the file in their working tree.

# Case 2 — Only the plugin-shipped copy exists

If only `${CLAUDE_PLUGIN_ROOT}/skills/cc-chat/roles/<slug>.md` resolves, surface a three-choice `AskUserQuestion`:

```
Edit "<slug>"?
  [ Fork to .claude/cc-chat/roles/<slug>.md ]  (default — leaves the plugin original untouched)
  [ Edit plugin file in place ]                (touches the installed plugin; not recommended)
  [ Cancel ]
```

- **Fork to local** → copy the plugin file's contents to `<project>/.claude/cc-chat/roles/<slug>.md`, ensure the directory exists, then open the local copy. After save, run `deno task lint-roles` and surface any errors.
- **Edit plugin in place** → open the plugin path directly. After save, run `deno task lint-roles`. Warn the user the change won't survive a plugin reinstall.
- **Cancel** → do nothing.

# Case 3 — Neither exists

Surface a two-choice `AskUserQuestion`:

```
No role file for "<slug>" exists. Create one?
  [ Create at .claude/cc-chat/roles/<slug>.md ]  (project-local seed)
  [ Cancel ]
```

If create: write a stub with required frontmatter (`slug`, `summary: "TODO"`, `version: 1`, `updated: <now>`) and an empty body, then open it. The user fills in the summary + body before the role can be lint-clean.

# After every save

Run `deno task lint-roles` once. If errors surface, report them inline — do not loop. The user re-edits and re-runs as needed.

No flags. One required positional arg.
