# T14: Transparent Bare Tree (b3nd-save 0.13 mapper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rig's store a transparent bare tree — the path IS the URI — using b3nd-save 0.13's mapper-owns-path-shape design, closing the dual-representation seam between the skill's bare-fs mode and the rig store.

**Architecture:** Replace the `mapToBytes` + two UPSTREAM_GAP wrappers in `src/rig.ts` with a single custom `staffTreeMapper: SaveMapper` that strips/re-adds `immutable://open/staff/` prefix on every URI hop and handles text/stream coercion. Bump b3nd-save imports to `^0.13.0`. Unify the root to `~/.staff` (no `/fs` subdirectory). One-time migration moves old `.bin` files to the new layout. E2e tests assert the transparency contract.

**Tech Stack:** Deno, TypeScript strict, b3nd-save@^0.13.0 (JSR: `jsr:@bandeira-tech/b3nd-save@^0.13.0`), b3nd-core@^0.24.0 (rig, connection — unchanged).

## Global Constraints

- All tests must pass: `deno task test` (35 tests across 3 files, 0 failures)
- Type-check must pass: `deno check src/mod.ts src/protocol.ts src/rig.ts src/cli/main.ts`
- b3nd-save subpath exports: `/fs`, `/entity`, `/clients` — all confirmed present in 0.13.0 deno.json
- BYTES_ENTITY.name is `"bytes"` — store bookkeeping lives at `.b3nd/entities/bytes`
- `$STAFF_ROOT` → `$STAFF_DATA_DIR` → `~/.staff` resolution order (no `/fs` suffix)
- `STAFF_DATA_DIR` still works for back-compat (existing tests set it)
- Commit message verbatim as specified in spec (see Task 7)
- Migration script at `/private/tmp/claude-503/-Users-m0-bandeira-tech-programs-staff/3d0d64e3-ae7c-45ba-b42e-cef2d24e0287/scratchpad/migrate-staff-store.ts` — NOT committed

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/rig.ts` | Modify | staffTreeMapper, resolveDataDir, bump imports, delete wrappers |
| `src/cli/verbs/rig.ts` | Modify | dataDir display derivation |
| `tests/e2e_test.ts` | Modify | Transparency contract test (plain files on disk) |
| `plugin/skills/staff/SKILL.md` | Modify | Built-on-b3nd section data-dir lines |
| `README.md` | Modify | Quickstart comment `(~/.staff/fs)` → `(~/.staff)` |
| `deno.lock` | Auto-updated | Lock update when b3nd-save version bumps (Deno updates it on next run) |
| scratchpad `migrate-staff-store.ts` | Create (not committed) | One-time migration of `~/.staff/fs` old layout |

---

## Task 1: Rewrite `src/rig.ts` — staffTreeMapper + root unification

**Files:**
- Modify: `src/rig.ts`

**Interfaces:**
- Produces: `export const staffTreeMapper: SaveMapper<string | Uint8Array, string>` (for tests that import it if ever needed)
- Produces: `resolveDataDir()` now checks `$STAFF_ROOT` → `$STAFF_DATA_DIR` → `~/.staff`
- Deletes: `bufferStreamsInRead`, `staffTextPayloads`, `UPSTREAM_GAP` comments

- [ ] **Step 1: Read `src/rig.ts` in full** (already done — see above; confirm nothing drifted)

- [ ] **Step 2: Write the new `src/rig.ts`**

Replace the entire file with:

```typescript
/**
 * @module
 * Default staff rig — the bundled rig the `staff` CLI loads when no
 * other rig is configured, and the module `bnd node` hosts for MCP/HTTP.
 *
 *   bnd node jsr:@bandeira-tech/staff/rig --mcp                 # MCP stdio
 *   bnd node jsr:@bandeira-tech/staff/rig --http --cors '*'     # HTTP + CORS (browsers, atrium)
 *
 * Data dir resolves in this order:
 *   1. $STAFF_ROOT
 *   2. $STAFF_DATA_DIR (back-compat alias)
 *   3. ~/.staff
 *
 * The rig store is a TRANSPARENT bare tree: the store URI IS the
 * relative filesystem path (no `immutable_open/` prefix, no `.bin`
 * suffix). Store bookkeeping lives in `.b3nd/entities/` (dot-prefixed,
 * ignored by conventional tree walkers). The rig root and the skill's
 * by-hand root are the same directory — `canon/traits/x/main.md` sits
 * directly under the root, readable by any tool.
 *
 * staffTreeMapper owns both URI-prefix translation and text/stream
 * coercion. The old UPSTREAM_GAP wrappers (bufferStreamsInRead,
 * staffTextPayloads) are deleted — the mapper supersedes them.
 *
 * The rig deliberately does NOT serve a web UI — that is a separate
 * application concern (see atrium).
 */

import { ensureDir } from "jsr:@std/fs@^1/ensure-dir";
import { walk } from "jsr:@std/fs@^1/walk";
import { dirname } from "jsr:@std/path@^1/dirname";
import { relative } from "jsr:@std/path@^1/relative";

import { connection, Rig } from "jsr:@bandeira-tech/b3nd-core@^0.24.0/rig";
import { FsStore } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/fs";
import type { FsExecutor } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/fs";
import { BYTES_ENTITY } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/entity";
import { SaveClient } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/clients";
import type { SaveMapper } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/clients";
import type { EntityRecord } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/entity";

const STAFF_URI_PATTERN = "immutable://open/staff/**";
const WIRE_PREFIX = "immutable://open/staff/";

/**
 * Bidirectional codec between the staff wire URI vocabulary
 * (`immutable://open/staff/…`) and the transparent FsStore
 * (store URI = relative filesystem path under rootDir).
 *
 * toStore  — strips the wire prefix; query string survives as suffix.
 * fromStore — re-adds the wire prefix; drops dot-prefixed entries
 *             (.b3nd/, .DS_Store, etc.) by returning null; buffers
 *             ReadableStream payloads to Uint8Array and decodes to
 *             string (staff URIs carry only text bodies).
 *
 * This mapper supersedes the old bufferStreamsInRead / staffTextPayloads
 * UPSTREAM_GAP wrappers — URI translation and payload coercion now live
 * in the same place, as SaveMapper intends.
 */
export const staffTreeMapper: SaveMapper<string | Uint8Array, string> = {
  toStore(wireUri: string, payload?: string | Uint8Array) {
    if (!wireUri.startsWith(WIRE_PREFIX)) {
      throw new Error(`foreign uri: ${wireUri}`);
    }
    const storeUri = wireUri.slice(WIRE_PREFIX.length);
    return {
      uri: storeUri,
      record: payload === undefined
        ? undefined
        : {
          payload: typeof payload === "string"
            ? new TextEncoder().encode(payload)
            : payload,
        },
    };
  },

  async fromStore(storeUri: string, record?: EntityRecord) {
    // Strip query string for dotfile segment check
    const qIdx = storeUri.indexOf("?");
    const pathPart = qIdx >= 0 ? storeUri.slice(0, qIdx) : storeUri;
    // Drop dot-prefixed entries (store bookkeeping .b3nd/, .DS_Store, etc.)
    if (pathPart.split("/").some((seg) => seg.startsWith("."))) {
      return null;
    }
    const wireUri = WIRE_PREFIX + storeUri;
    if (record === undefined) {
      return { uri: wireUri };
    }
    // Buffer ReadableStream → Uint8Array → string
    const raw = record.payload;
    let bytes: Uint8Array;
    if (
      raw !== null && raw !== undefined &&
      typeof (raw as unknown as ReadableStream).getReader === "function"
    ) {
      bytes = new Uint8Array(
        await new Response(raw as ReadableStream<Uint8Array>).arrayBuffer(),
      );
    } else if (raw instanceof Uint8Array) {
      bytes = raw;
    } else {
      bytes = new Uint8Array(0);
    }
    return { uri: wireUri, payload: new TextDecoder().decode(bytes) };
  },
};

function resolveDataDir(): string {
  const root = Deno.env.get("STAFF_ROOT");
  if (root) return root;
  const env = Deno.env.get("STAFF_DATA_DIR");
  if (env) return env;
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("STAFF_ROOT, STAFF_DATA_DIR unset and HOME unset");
  return `${home}/.staff`;
}

function fsExecutor(): FsExecutor {
  return {
    async readFile(path) {
      const f = await Deno.open(path, { read: true });
      return f.readable;
    },
    async writeFile(path, content) {
      await ensureDir(dirname(path));
      if (content instanceof Uint8Array) {
        await Deno.writeFile(path, content);
        return;
      }
      const f = await Deno.open(path, { write: true, create: true, truncate: true });
      await content.pipeTo(f.writable);
    },
    async removeFile(path) {
      await Deno.remove(path);
    },
    async exists(path) {
      try { await Deno.stat(path); return true; } catch { return false; }
    },
    async listFiles(dir) {
      const out: string[] = [];
      try {
        for await (const e of Deno.readDir(dir)) if (e.isFile) out.push(e.name);
      } catch { /* missing dir → empty list per FsExecutor contract */ }
      return out;
    },
    async *walkFiles(dir) {
      try {
        for await (
          const entry of walk(dir, {
            includeDirs: false,
            includeFiles: true,
            includeSymlinks: false,
            followSymlinks: false,
          })
        ) {
          yield relative(dir, entry.path).replaceAll("\\", "/");
        }
      } catch { /* missing dir → empty walk */ }
    },
  };
}

export default async function staffRig(): Promise<Rig> {
  const root = resolveDataDir();
  await ensureDir(root);

  const store = new FsStore(root, fsExecutor());
  await store.provisionEntity(store.entitySupport(BYTES_ENTITY));

  const client = new SaveClient(staffTreeMapper, BYTES_ENTITY, store);
  // Cast at connection() boundary: b3nd-save@^0.13.0 imports b3nd-core@^0.22;
  // rig imports b3nd-core@^0.24. SaveClient structurally implements
  // ProtocolInterfaceNode from both versions; the cast is safe.
  // deno-lint-ignore no-explicit-any
  const conn = connection(client as any, [STAFF_URI_PATTERN]);

  return new Rig({
    routes: {
      receive: [conn],
      read: [conn],
      observe: [conn],
    },
  });
}
```

- [ ] **Step 3: Verify `deno check src/rig.ts` passes**

```bash
cd /Users/m0/bandeira.tech/programs/staff && deno check src/rig.ts
```

Expected: clean (no errors). If b3nd-core type conflict appears at the `connection()` call despite the cast, widen the cast to `as any` on the whole expression. If `EntityRecord` import path differs, check `~/ws/b3nd-save/deno.json` exports — it's at `./entity` which maps to `src/entity.ts`.

---

## Task 2: Update `src/cli/verbs/rig.ts` — dataDir display

**Files:**
- Modify: `src/cli/verbs/rig.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent)
- Produces: `rigInfo.dataDir` now reflects `$STAFF_ROOT` → `$STAFF_DATA_DIR` → `~/.staff`

- [ ] **Step 1: Edit the dataDir line in `rigInfo()`**

In `src/cli/verbs/rig.ts`, replace:
```typescript
  const dataDir = Deno.env.get("STAFF_DATA_DIR") ?? `${home}/.staff/fs`;
```
with:
```typescript
  const dataDir = Deno.env.get("STAFF_ROOT") ??
    Deno.env.get("STAFF_DATA_DIR") ??
    `${home}/.staff`;
```

- [ ] **Step 2: Verify the file looks correct**

The full `rigInfo` function should now be:
```typescript
export async function rigInfo(opts: { explicit?: string }): Promise<RigInfo> {
  const { rig, source } = await loadStaffRig(opts);
  const home = Deno.env.get("HOME") ?? "";
  const dataDir = Deno.env.get("STAFF_ROOT") ??
    Deno.env.get("STAFF_DATA_DIR") ??
    `${home}/.staff`;
  const info: RigInfo = {
    input: source.input,
    origin: source.origin,
    dataDir,
  };
  if (typeof rig.status === "function") {
    try {
      info.status = await rig.status();
    } catch (e) {
      info.statusError = e instanceof Error ? e.message : String(e);
    }
  }
  return info;
}
```

---

## Task 3: Add e2e transparency contract test

**Files:**
- Modify: `tests/e2e_test.ts`

**Interfaces:**
- Consumes: `runStaff` helper (already defined in the file; sets `STAFF_DATA_DIR: \`${opts.home}/fs\``)
- Produces: new test "e2e: transparent tree — path is URI" asserting plain files exist at store-URI paths

**Note:** The e2e tests set `STAFF_DATA_DIR: \`${opts.home}/fs\`` — so the data dir is `${home}/fs`. After the change, plain files will live at `${home}/fs/proposal/...` (no `immutable_open/` prefix, no `.bin` suffix).

- [ ] **Step 1: Write the failing test** (append to `tests/e2e_test.ts`)

Append after the last test in the file:

```typescript
// ─── 8. transparent tree — path is URI ──────────────────────────────────────

Deno.test("e2e: transparent tree — path is URI (b3nd-save 0.13 regression guard)", async () => {
  const home = await Deno.makeTempDir();
  // runStaff sets STAFF_DATA_DIR = ${home}/fs
  const dataDir = `${home}/fs`;

  // add trait
  const add = await runStaff(
    ["add", "trait", "skeptical", "You don't trust..."],
    { home },
  );
  assertEquals(add.code, 0, `add stderr: ${add.stderr}`);

  // Parse the URI from the output line: "✓ immutable://open/staff/proposal/..."
  const wireUri = add.stdout.trim().replace(/^✓ /, "");
  assert(wireUri.startsWith("immutable://open/staff/"), `unexpected URI: ${wireUri}`);
  const storePath = wireUri.slice("immutable://open/staff/".length);

  // The file must exist as plain text at ${dataDir}/${storePath} — no .bin, no prefix dir
  let content: string;
  try {
    content = await Deno.readTextFile(`${dataDir}/${storePath}`);
  } catch {
    throw new Error(
      `transparent-tree: file not found at ${dataDir}/${storePath}\n` +
      `  (add output was: ${add.stdout.trim()})`,
    );
  }
  assertEquals(content, "You don't trust...", "proposal file content must round-trip exactly");

  // .b3nd/ store bookkeeping must exist under the data dir
  let b3ndStat: Deno.FileInfo;
  try {
    b3ndStat = await Deno.stat(`${dataDir}/.b3nd`);
  } catch {
    throw new Error(`transparent-tree: .b3nd/ not found under ${dataDir}`);
  }
  assert(b3ndStat.isDirectory, ".b3nd/ must be a directory");

  // promote
  const promote = await runStaff(["promote", "trait", "skeptical"], { home });
  assertEquals(promote.code, 0, `promote stderr: ${promote.stderr}`);

  // canon/traits/skeptical/main.md must exist as a plain markdown file
  let canonContent: string;
  try {
    canonContent = await Deno.readTextFile(`${dataDir}/canon/traits/skeptical/main.md`);
  } catch {
    throw new Error(`transparent-tree: canon file not found at ${dataDir}/canon/traits/skeptical/main.md`);
  }
  assertEquals(canonContent, "You don't trust...", "canon file content must round-trip exactly");

  // No immutable_open/ directory should exist (old layout is gone)
  let oldLayoutExists = false;
  try {
    await Deno.stat(`${dataDir}/immutable_open`);
    oldLayoutExists = true;
  } catch { /* expected — old dir must not exist */ }
  assert(!oldLayoutExists, "immutable_open/ must not exist in the transparent tree");
});
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/m0/bandeira.tech/programs/staff && deno task test 2>&1
```

Expected: 36 tests pass (35 previous + 1 new). If the new test fails with "file not found", the rig.ts changes from Task 1 didn't take effect — check imports and that the lock was refreshed.

If `deno.lock` conflict: run `deno task test --no-lock` once to confirm the logic is right, then `deno cache --reload src/rig.ts` to refresh the lock.

---

## Task 4: Type-check the full module graph

**Files:** (none modified — verification only)

- [ ] **Step 1: Run deno check on the full surface**

```bash
cd /Users/m0/bandeira.tech/programs/staff && deno check src/mod.ts src/protocol.ts src/rig.ts src/cli/main.ts
```

Expected: no errors. 

Common issues:
- If `SaveMapper` type conflict between b3nd-core@0.22 and @0.24: the `as any` cast on `connection(client as any, ...)` handles it. 
- If `EntityRecord` isn't found at `jsr:@bandeira-tech/b3nd-save@^0.13.0/entity`: check the exports in b3nd-save deno.json — the entity export maps to `./src/entity.ts` which exports `EntityRecord`. If the import path changed, use `jsr:@bandeira-tech/b3nd-save@^0.13.0/clients` which re-exports `SaveMapper` already.
- If `StorePayload` type mismatch on `writeFile`: `FsExecutor.writeFile` takes `StorePayload` which is `Uint8Array | ReadableStream`. Our mapper always encodes strings to `Uint8Array` before writing, so this should be clean.

---

## Task 5: Write and run the migration script

**Files:**
- Create: `/private/tmp/claude-503/-Users-m0-bandeira-tech-programs-staff/3d0d64e3-ae7c-45ba-b42e-cef2d24e0287/scratchpad/migrate-staff-store.ts`

- [ ] **Step 1: Write the migration script**

```typescript
/**
 * One-time migration: old b3nd-save 0.12 FsStore layout →
 * transparent b3nd-save 0.13 layout.
 *
 * Old: ~/.staff/fs/immutable_open/staff/<relative>.bin
 * New: ~/.staff/<relative>          (no .bin, no prefix)
 *
 * Old ~/.staff/fs is left intact as backup.
 * Run: deno run -A <this-file>
 */

import { ensureDir } from "jsr:@std/fs@^1/ensure-dir";
import { walk } from "jsr:@std/fs@^1/walk";
import { dirname } from "jsr:@std/path@^1/dirname";

const HOME = Deno.env.get("HOME")!;
const OLD_ROOT = `${HOME}/.staff/fs/immutable_open/staff`;
const NEW_ROOT = `${HOME}/.staff`;

let moved = 0;
let skipped = 0;

for await (const entry of walk(OLD_ROOT, { includeDirs: false })) {
  // entry.path is absolute: ${OLD_ROOT}/<relative>.bin
  const rel = entry.path.slice(OLD_ROOT.length + 1); // strip leading slash
  if (!rel.endsWith(".bin")) {
    console.log(`skip (no .bin): ${rel}`);
    skipped++;
    continue;
  }
  const newRel = rel.slice(0, -4); // strip .bin
  const dest = `${NEW_ROOT}/${newRel}`;

  if (await exists(dest)) {
    console.log(`skip (exists):  ${newRel}`);
    skipped++;
    continue;
  }

  const bytes = await Deno.readFile(entry.path);
  await ensureDir(dirname(dest));
  await Deno.writeFile(dest, bytes);
  console.log(`moved: ${newRel}`);
  moved++;
}

console.log(`\nMigration complete: ${moved} moved, ${skipped} skipped.`);
console.log(`Old layout preserved at ${HOME}/.staff/fs`);
console.log(`New layout at ${NEW_ROOT}`);

async function exists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; } catch { return false; }
}
```

- [ ] **Step 2: Run the migration script**

```bash
deno run -A /private/tmp/claude-503/-Users-m0-bandeira-tech-programs-staff/3d0d64e3-ae7c-45ba-b42e-cef2d24e0287/scratchpad/migrate-staff-store.ts
```

Expected output lists each moved file (7 session files), e.g.:
```
moved: sessions/pass-2-cli-cast/20260702005206-main.md
moved: sessions/pass-2-cli-cast/20260702011909-update.md
...
Migration complete: 7 moved, 0 skipped.
```

- [ ] **Step 3: Verify the migration**

```bash
ls ~/.staff/sessions/pass-2-cli-cast/
```

Expected: plain `.md` files (no `.bin` suffix).

```bash
staff read sessions/pass-2-cli-cast/20260702005206-main.md
```

Expected: returns the session mandate text (non-empty markdown content).

If `staff read` fails with "not found", check that the installed `staff` binary resolves `STAFF_DATA_DIR` correctly. The installed binary points at this working tree; after the change, it defaults to `~/.staff` (not `~/.staff/fs`). If `STAFF_DATA_DIR` is set in the shell environment pointing to the old path, unset it or set `STAFF_ROOT=~/.staff`.

---

## Task 6: Prose sweep

**Files:**
- Modify: `plugin/skills/staff/SKILL.md`
- Modify: `README.md`

**Interfaces:** (none — documentation only)

- [ ] **Step 1: Update `plugin/skills/staff/SKILL.md` — Built on b3nd section**

In the "Built on b3nd" section, find the paragraph:
```
The rig's store resolves its data dir from `$STAFF_DATA_DIR`, defaulting to
`~/.staff/fs`. If `b3nd_status` doesn't return...
```

Replace it with:
```
The rig's store resolves its data dir in order: `$STAFF_ROOT` →
`$STAFF_DATA_DIR` → `~/.staff`. The rig's tree is the same human-readable
tree as the bare-fs convention — one root, one layout, by hand or through
the program. If `b3nd_status` doesn't return...
```

- [ ] **Step 2: Update `README.md` quickstart comment**

Find line 35:
```
    staff rig                                               # health: which rig, where data lives (~/.staff/fs)
```

Replace with:
```
    staff rig                                               # health: which rig, where data lives (~/.staff)
```

Also find line 49 (Pass 2 status paragraph):
```
bundled FsStore rig by default (`~/.staff/fs`), user-pluggable via `staff rig`.
```

Replace with:
```
bundled FsStore rig by default (`~/.staff`), user-pluggable via `staff rig`.
```

- [ ] **Step 3: Check `src/cli/main.ts` HELP text for data dir mentions**

Grep for data dir references:
```bash
grep -n "\.staff\|DATA_DIR\|STAFF_ROOT" /Users/m0/bandeira.tech/programs/staff/src/cli/main.ts
```

Expected: none (the HELP text doesn't mention the data dir directly). No change needed.

- [ ] **Step 4: Run tests one more time to confirm prose-only changes didn't break anything**

```bash
cd /Users/m0/bandeira.tech/programs/staff && deno task test 2>&1 | tail -5
```

Expected: `ok | 36 passed | 0 failed`

---

## Task 7: Commit code, tests, and prose

**Files:** `src/rig.ts`, `src/cli/verbs/rig.ts`, `tests/e2e_test.ts`, `plugin/skills/staff/SKILL.md`, `README.md`, `deno.lock` (auto-updated)

- [ ] **Step 1: Stage all changes**

```bash
cd /Users/m0/bandeira.tech/programs/staff && git add src/rig.ts src/cli/verbs/rig.ts tests/e2e_test.ts plugin/skills/staff/SKILL.md README.md deno.lock
```

- [ ] **Step 2: Verify staged files**

```bash
git diff --cached --stat
```

Expected: 6 files changed (rig.ts, verbs/rig.ts, e2e_test.ts, SKILL.md, README.md, deno.lock).

- [ ] **Step 3: Create the commit**

```bash
git commit -m "$(cat <<'EOF'
rig: transparent bare tree — the path is the URI (b3nd-save 0.13 mapper)

staffTreeMapper strips/re-adds the wire prefix and owns text/stream
coercion; the old UPSTREAM_GAP wrappers are deleted. Root resolution
unifies with the skill: $STAFF_ROOT → $STAFF_DATA_DIR → ~/.staff. The
rig store and the bare-fs convention are now the same tree.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Confirm commit**

```bash
git log --oneline -3
```

Expected: the new commit at the top with message starting `rig: transparent bare tree`.

---

## Task 8: Write task report

**Files:**
- Create: `/Users/m0/bandeira.tech/programs/staff/.superpowers/sdd/task-14-report.md`

- [ ] **Step 1: Create the report directory and file**

```bash
mkdir -p /Users/m0/bandeira.tech/programs/staff/.superpowers/sdd
```

Write the report with:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED
- Changes made (list files)
- Verification output (test count, deno check result, migration result)
- Drift from spec (any b3nd-save 0.13 API differences found vs. spec facts)
- Concerns (if any)

---

## Self-Review

### Spec coverage check:

| Spec requirement | Task |
|-----------------|------|
| staffTreeMapper — toStore strips prefix | Task 1 |
| staffTreeMapper — fromStore re-adds prefix | Task 1 |
| staffTreeMapper — fromStore drops dotfiles | Task 1 |
| staffTreeMapper — buffers ReadableStream → string | Task 1 |
| Delete bufferStreamsInRead | Task 1 |
| Delete staffTextPayloads | Task 1 |
| Bump b3nd-save to ^0.13.0 | Task 1 |
| STAFF_ROOT → STAFF_DATA_DIR → ~/.staff | Task 1 |
| Cast at connection() for core version mismatch | Task 1 |
| FsExecutor shape verified | Task 1 (confirmed via reading ~/ws/b3nd-save/src/fs/mod.ts — no drift) |
| src/cli/verbs/rig.ts dataDir update | Task 2 |
| e2e test: plain file after add | Task 3 |
| e2e test: plain canon file after promote | Task 3 |
| e2e test: .b3nd/ exists | Task 3 |
| e2e test: no immutable_open/ | Task 3 |
| deno task test all pass | Task 3 / Task 4 |
| deno check clean | Task 4 |
| Migration script created | Task 5 |
| Migration script run + verified | Task 5 |
| SKILL.md prose | Task 6 |
| README.md quickstart | Task 6 |
| Commit (one commit, exact message) | Task 7 |
| Report to .superpowers/sdd/task-14-report.md | Task 8 |

### Placeholder scan: None found.

### Type consistency check:
- `staffTreeMapper` typed as `SaveMapper<string | Uint8Array, string>` — used in `new SaveClient(staffTreeMapper, BYTES_ENTITY, store)` where `TIn = string | Uint8Array`, `TOut = string`.
- `EntityRecord` imported from same b3nd-save 0.13.0 path as `SaveMapper` — consistent.
- `fromStore` returns `{ uri: string; payload?: string } | null` — matches `SaveMapper<..., string>` interface.

### Key drift verified:
- b3nd-save 0.13.0 exports: `/fs`, `/entity`, `/clients` all present — confirmed via local deno.json.
- `FsExecutor` interface: `readFile`, `writeFile`, `removeFile`, `exists`, `listFiles`, `walkFiles` — all present and matching the existing implementation in rig.ts. No drift.
- `BYTES_ENTITY.name = "bytes"` (not "bytes_store") — `.b3nd/entities/bytes` will be the meta file.
- 0.13.0 is published on JSR — confirmed via `deno info`.
- b3nd-core version gap (^0.22 vs ^0.24) — handled with `as any` cast at connection().
