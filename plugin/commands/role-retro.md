---
description: Run the retro-pass on a closed cc-chat room (defaults to the most recent). Proposes diffs to summoned roles, then walks the user through per-role approval.
argument-hint: [<room>]
---

**Room:** `$ARGUMENTS` (omit → most recent `.cc-chat/<room>/meta.md` by mtime)

Manual entry point to the "growing roles" loop. Mirrors the auto-retro that the manager runs after Step 9 of `/cc-chat:manage-coordination`, but bypasses the idempotency check (the user explicitly opted to re-run).

# Step 1 — Pick the room

- If `$ARGUMENTS` is empty: find every `<project>/.cc-chat/*/meta.md`, pick the one with the latest `room` slug timestamp (the slug starts with `YYYYMMDDhhmmss`).
- If `$ARGUMENTS` is a slug: validate it matches a directory under `.cc-chat/`. If not, exit with `no such room: "<arg>"`.
- If the room has no `meta.md` (legacy format), surface `AskUserQuestion`:

  ```
  Room "<slug>" has no meta.md (legacy format). Proceed by synthesizing the
  role list from ledger.md + output.md, or cancel?
    [ Synthesize ]  [ Cancel ]
  ```

  Synthesize is best-effort; the retro-pass agent reads ledger.md + output.md and guesses role names.

# Step 2 — Dispatch retro-pass

Dispatch the `retro-pass` agent (`plugin/agents/retro-pass.md`) with arguments:

```
roomSlug:    <picked slug>
projectRoot: <cwd>
pluginRoot:  ${CLAUDE_PLUGIN_ROOT}
mode:        manual    # signals: ignore the idempotency check
```

The agent reads the room, composes proposed diffs, writes them to `<project>/.cc-chat/<room>/retro/<slug>.proposed.md`, posts one summary msg, and exits.

# Step 3 — Walk the approval loop

For each `<slug>.proposed.md` the agent left behind, surface one `AskUserQuestion`:

```
Retro proposes a v<N+1> for role "<slug>". <one-line summary of the change>.

  [ Accept ]         Write to <resolved target path>, bump version, append room to sourced_from.
  [ Edit ]           Open both files in $EDITOR; on save, accept the edited body.
  [ Skip ]           Discard the proposed diff for this role.
  [ Save for later ] Leave the .proposed.md in place; no decision now.
```

`<resolved target path>` is the path that dispatch resolved at the start of the room — recorded in `meta.md`'s `role_file` field. If the room had no `role_file` resolution and this is a new seed, the path defaults to `.claude/cc-chat/roles/<slug>.md` (project-local — the user-grown roster). No follow-up question; the plugin tree is not a write target for user-grown cards.

Landing rules (per design-spec §5.4):

- **Accept** → use `src/retro.ts`'s `buildAcceptedBody({ proposedRaw, targetPath, roomSlug })` to compute the new file body, write it to the resolved target. Do NOT auto-commit; surface the file change in the closing report so the user commits via their normal flow.
- **Edit** → `open <current>` and `open <proposed>`; when the user signals done, treat the next read of the proposed path as the accepted body.
- **Skip** → `rm <project>/.cc-chat/<room>/retro/<slug>.proposed.md`.
- **Save for later** → leave `.proposed.md` in place. Re-running `/cc-chat:role-retro` picks it up.

# Step 4 — Closing report

Print to the user:
- Per-role disposition (slug → Accepted | Edited | Skipped | Saved).
- Absolute paths of every role file mutated.
- One-line reminder: `git status` will show the changes; commit at your discretion.

If any file was mutated, run `deno task lint-roles` once and surface any errors. The user fixes and re-runs as needed.

# What this command does NOT do

- Does not commit. The user keeps control.
- Does not rewrite the room's `meta.md`.
- Does not delete role files.
- Does not propagate changes across rooms.
- Does not skip via the idempotency check — that's auto-retro only. Manual is always permissive.
