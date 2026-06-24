# manage-coordination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/cc-chat:manage-coordination <prose>` to cc-chat, plus migrate cc-chat's URI grammar to the unified `<root>/<room>/<participant>/<type>/<ts>-<slug>.md` shape.

**Architecture:** One protocol module rewrite (`src/protocol.ts`) drives downstream churn in roster/tail/client/mod and the web/scripts/plugin surfaces. New `manage-coordination` command inlines a long-running participant subagent template. Worker-room semantics: persistent rig backend, do-don't-ask participants, manager-and-user steering.

**Tech Stack:** Deno-first (deno.json present), TypeScript strict, `@std/assert` for tests, `@bandeira-tech/b3nd-core` + `@bandeira-tech/b3nd-move` JSR deps. Plugin layer is markdown command files + a skill markdown file.

## Global Constraints

- Reference spec: `docs/superpowers/specs/2026-06-24-manage-coordination-design.md` — every task's requirements implicitly include the spec's section by the same name.
- One unified URI grammar: `<root>/<room>/<participant>/<type>/<ts>-<slug>.md` with single exception `<root>/<room>/meta.md`.
- Type closed set: `join`, `msg`, `pause`, `resume`, `end`, `mention`, `output`.
- Manager-only types: `pause`, `resume`, `output`, room-closing `end`.
- Participant alphabet: `[a-z0-9][a-z0-9-]{0,31}`. Slug alphabet: `[a-z0-9][a-z0-9-]{0,47}`.
- Tests use `deno task test` (run by `deno test --allow-all tests/`). All tests must pass before each commit.
- Code style: follow existing repo conventions (terse JSDoc module headers, function-style helpers, no classes unless used elsewhere, prefer named exports).
- No backwards-compat shims — the cutover is clean. The existing demo should be re-run end-to-end after the migration.
- Always `open` viewable deliverables (per CLAUDE.md). Commit and push at the end of each discrete change (no remote → ask first if needed).
- Default root in commands and docs: `immutable://open/cc-chat/` (persistent). `client.ts`'s default constructor root may stay `"cc-chat://"` (tunable) — callers specify the persistent root.

---

## File structure (what changes, what's new)

**Modified:**
- `src/protocol.ts` — rewrite around unified grammar
- `src/roster.ts` — derive from `join`/`end` URI types
- `src/tail.ts` — yield records carrying parsed type info
- `src/client.ts` — verify untouched; only doc comment may shift
- `src/mod.ts` — re-export new symbols
- `tests/protocol_test.ts` — rewrite
- `tests/roster_test.ts` — rewrite
- `tests/tail_test.ts` — update for new record shape
- `tests/client_test.ts` — verify intact (likely no change)
- `scripts/say.ts` — new grammar; optional `--type`, `--mention` flags
- `scripts/tail.ts` — accept `--room` for narrow viewing
- `web/index.html`, `web/app.js` — type-aware rendering + meta.md header
- `plugin/commands/join.md` — new grammar
- `plugin/commands/say.md` — new grammar (mints `msg`)
- `plugin/commands/observe.md` — subscribe `<root>/<room>/**`
- `plugin/commands/who.md` — derive from join/end
- `plugin/skills/cc-chat/SKILL.md` — teach unified grammar + worker-room
- `docs/contract.md`, `architecture.md`, `cookbook.md`, `usage.md`, `design.md`, `lab.md`, `demo.md`, `problem.md` — adjust to new grammar
- `README.md` — top-level update for new command and grammar
- `deno.json` — verify nothing changes (no new deps expected)

**Created:**
- `plugin/commands/manage-coordination.md` — the new manager command
- `tests/coordination_test.ts` — wire-level integration test

**Not created (deliberate):**
- `plugin/agents/*` — participant template is inlined in the command
- Any backwards-compat shim
- A bundled `.claude/cc-chat.local.md` — that file is per-project, not plugin-shipped

---

## Task 0: Pre-flight verification and baseline

**Files:**
- Read: `src/client.ts`, `src/protocol.ts`, existing tests
- Read: `@bandeira-tech/b3nd-move/http/client` symbol surface (probe `node_modules` or JSR cache)
- Note: write findings inline at the top of this plan (under "Verification findings" appended below) OR as a top-level comment in `src/protocol.ts` if persistent in source helps

**Interfaces:**
- Produces: a concrete answer to "does the rig accept multi-glob subscribes like `<room>/*/msg/**`", and confirmation of the plugin-settings frontmatter shape.

- [ ] **Step 1: Baseline existing tests**

```sh
cd /Users/m0/ws/b3nd-cc-chat && deno task test 2>&1 | tail -20
```

Expected: `26 passed`. If less, stop and investigate before starting the migration.

- [ ] **Step 2: Verify b3nd-move HTTP client's `observe` signature**

```sh
cd /Users/m0/ws/b3nd-cc-chat && deno doc --json 'jsr:@bandeira-tech/b3nd-move@^0.18.0/http/client' 2>/dev/null | grep -E '"name":"observe"' -A 30 | head -60
```

If `observe` takes `patterns: string[]` (multiple), then participants can subscribe to a list of globs (`[".../*/msg/**", ".../manager/pause/**", ...]`). If `observe` takes a single pattern, participants subscribe to `<room>/**` and filter records client-side. Record the answer.

- [ ] **Step 3: Read b3nd plugin's MCP `resources/subscribe` docs**

```sh
grep -rn 'resources/subscribe' /Users/m0/ws/b3nd-core /Users/m0/ws/b3nd-move 2>/dev/null | head -20
```

Confirm whether the MCP layer can subscribe to multiple URI patterns per call or only one. Record the answer.

- [ ] **Step 4: Check plugin-settings convention**

Read the bundled `plugin-dev:plugin-settings` skill if available; otherwise sample any existing project that uses `.claude/<plugin>.local.md`:

```sh
ls /Users/m0/.claude/plugins/cache 2>/dev/null
grep -rln 'plugin-name.local.md\|cc-chat.local' /Users/m0/.claude/plugins 2>/dev/null | head
```

Record the expected frontmatter shape — at minimum: `participant-tool-budget: read-only-chat | full-this-run | full-always`.

- [ ] **Step 5: Verify the rig under default root persists URIs**

If a rig is running locally (`http://127.0.0.1:7373`), post a URI under `immutable://open/cc-chat/` and read it back after >60s to confirm persistence. If no rig is running, defer to the existing README's claim and document the assumption in the manager command.

- [ ] **Step 6: Write findings**

Append a "Verification findings" subsection at the bottom of this plan file with:
1. observe multi-pattern: yes/no
2. MCP subscribe multi-pattern: yes/no
3. plugin-settings frontmatter shape: <yaml example>
4. persistence under `immutable://open/cc-chat/`: confirmed/assumed

- [ ] **Step 7: Commit findings**

```sh
git add docs/superpowers/plans/2026-06-24-manage-coordination.md
git commit -m "Plan: pre-flight verification findings"
```

---

## Task 1: Rewrite `src/protocol.ts` (TDD)

**Files:**
- Rewrite: `src/protocol.ts`
- Rewrite: `tests/protocol_test.ts`

**Interfaces:**
- Produces (exports):
  - `TYPES: readonly ["join","msg","pause","resume","end","mention","output"]`
  - `MANAGER_ONLY_TYPES: readonly ["pause","resume","output"]`
  - `META_LEAF = "meta.md"` constant
  - `isValidName(name: string): boolean` — `[a-z0-9][a-z0-9-]{0,31}`
  - `isValidSlug(slug: string): boolean` — `[a-z0-9][a-z0-9-]{0,47}`
  - `isValidRoom(room: string): boolean` — `<ts>-<slug>` where ts is 14 digits
  - `formatTs(date: Date): string` (unchanged signature)
  - `mintNonce(): string` (unchanged signature; 6 base32-ish chars)
  - `mintRoom(slug: string, date?: Date): string` → `<ts>-<slug>`
  - `metaUri(root: string, room: string): string`
  - `joinUri(root, room, who, date?): string`
  - `msgUri(root, room, who, slug, date?): string`
  - `pauseUri(root, room, date?): string` (manager-only — manager name baked in)
  - `resumeUri(root, room, date?): string` (manager-only)
  - `endUri(root, room, who, date?): string`
  - `mentionUri(root, room, from, to, slug, date?): string`
  - `outputUri(root, room, slug, date?): string` (manager-only)
  - `type ParsedUri` — discriminated union by `type`, with `room`, `who?` (absent for meta), `target?` (for mention), `ts?`, `slug?`, `nonce?`
  - `parseUri(root, uri): ParsedUri | null`
  - `validate(root, uri): void` — throws on invalid shape, alphabet, type, or manager-only mismatch
  - `MANAGER_NAME = "manager"` constant
- Consumes: nothing (foundation module).

**Approach:** TDD. Write failing tests first, then implement. Wipe both files and rewrite — the diff is too large to incrementally edit.

- [ ] **Step 1: Stash old `protocol.ts` for reference, then empty the file**

```sh
cp src/protocol.ts /tmp/protocol.ts.old
: > src/protocol.ts
: > tests/protocol_test.ts
```

- [ ] **Step 2: Write failing tests in `tests/protocol_test.ts`**

```ts
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  TYPES,
  MANAGER_ONLY_TYPES,
  MANAGER_NAME,
  META_LEAF,
  isValidName,
  isValidSlug,
  isValidRoom,
  formatTs,
  mintNonce,
  mintRoom,
  metaUri,
  joinUri,
  msgUri,
  pauseUri,
  resumeUri,
  endUri,
  mentionUri,
  outputUri,
  parseUri,
  validate,
} from "../src/protocol.ts";

const ROOT = "immutable://open/cc-chat/";

Deno.test("TYPES is the closed set", () => {
  assertEquals([...TYPES], ["join","msg","pause","resume","end","mention","output"]);
});

Deno.test("MANAGER_ONLY_TYPES contains pause/resume/output", () => {
  assertEquals([...MANAGER_ONLY_TYPES], ["pause","resume","output"]);
});

Deno.test("MANAGER_NAME is 'manager'", () => {
  assertEquals(MANAGER_NAME, "manager");
});

Deno.test("META_LEAF is 'meta.md'", () => {
  assertEquals(META_LEAF, "meta.md");
});

Deno.test("isValidName accepts simple names", () => {
  assert(isValidName("researcher"));
  assert(isValidName("a"));
  assert(isValidName("src-auth"));
  assert(isValidName("a" + "b".repeat(31)));
});

Deno.test("isValidName rejects bad shapes", () => {
  assert(!isValidName(""));
  assert(!isValidName("Researcher"));
  assert(!isValidName("-leading"));
  assert(!isValidName("has spaces"));
  assert(!isValidName("a".repeat(33)));
});

Deno.test("isValidSlug accepts up to 48 chars", () => {
  assert(isValidSlug("a"));
  assert(isValidSlug("design-review"));
  assert(isValidSlug("a" + "b".repeat(47)));
  assert(!isValidSlug("a" + "b".repeat(48)));
  assert(!isValidSlug("-leading"));
});

Deno.test("isValidRoom is <ts>-<slug>", () => {
  assert(isValidRoom("20260624120000-design-review"));
  assert(!isValidRoom("design-review"));
  assert(!isValidRoom("2026-design-review"));
});

Deno.test("formatTs formats UTC as 14 digits", () => {
  const ts = formatTs(new Date(Date.UTC(2026, 5, 24, 12, 0, 0)));
  assertEquals(ts, "20260624120000");
});

Deno.test("mintNonce returns 6 base32 chars", () => {
  const n = mintNonce();
  assertEquals(n.length, 6);
  assert(/^[a-z0-9]{6}$/.test(n));
});

Deno.test("mintRoom builds <ts>-<slug>", () => {
  const room = mintRoom("design-review", new Date(Date.UTC(2026, 5, 24, 12, 0, 0)));
  assertEquals(room, "20260624120000-design-review");
});

Deno.test("metaUri is <root>/<room>/meta.md", () => {
  const u = metaUri(ROOT, "20260624120000-design-review");
  assertEquals(u, "immutable://open/cc-chat/20260624120000-design-review/meta.md");
});

Deno.test("joinUri shape", () => {
  const u = joinUri(ROOT, "20260624120000-r", "src-auth", new Date(Date.UTC(2026, 5, 24, 12, 0, 5)));
  assert(u.startsWith("immutable://open/cc-chat/20260624120000-r/src-auth/join/20260624120005-"));
  assert(u.endsWith(".json"));
});

Deno.test("msgUri shape includes slug", () => {
  const u = msgUri(ROOT, "20260624120000-r", "src-auth", "starting-x", new Date(Date.UTC(2026, 5, 24, 12, 0, 5)));
  assert(u.startsWith("immutable://open/cc-chat/20260624120000-r/src-auth/msg/20260624120005-"));
  assert(u.includes("starting-x"));
  assert(u.endsWith(".md"));
});

Deno.test("pauseUri pins to manager", () => {
  const u = pauseUri(ROOT, "20260624120000-r", new Date(Date.UTC(2026, 5, 24, 12, 0, 5)));
  assert(u.includes("/manager/pause/"));
});

Deno.test("resumeUri pins to manager", () => {
  const u = resumeUri(ROOT, "20260624120000-r");
  assert(u.includes("/manager/resume/"));
});

Deno.test("endUri carries who", () => {
  const u = endUri(ROOT, "20260624120000-r", "src-auth");
  assert(u.includes("/src-auth/end/"));
});

Deno.test("mentionUri carries from and target", () => {
  const u = mentionUri(ROOT, "20260624120000-r", "src-auth", "src-db", "schema-question");
  assert(u.includes("/src-auth/mention/src-db/"));
  assert(u.includes("schema-question"));
});

Deno.test("outputUri pins to manager", () => {
  const u = outputUri(ROOT, "20260624120000-r", "deliverable");
  assert(u.includes("/manager/output/"));
});

Deno.test("parseUri on meta", () => {
  const u = metaUri(ROOT, "20260624120000-r");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "meta");
  assertEquals(p?.room, "20260624120000-r");
});

Deno.test("parseUri on join", () => {
  const u = joinUri(ROOT, "20260624120000-r", "src-auth");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "join");
  assertEquals(p?.room, "20260624120000-r");
  assertEquals(p?.who, "src-auth");
});

Deno.test("parseUri on msg", () => {
  const u = msgUri(ROOT, "20260624120000-r", "src-auth", "starting");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "msg");
  assertEquals(p?.who, "src-auth");
  assertEquals(p?.slug, "starting");
});

Deno.test("parseUri on mention", () => {
  const u = mentionUri(ROOT, "20260624120000-r", "src-auth", "src-db", "q");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "mention");
  assertEquals(p?.who, "src-auth");
  assertEquals(p?.target, "src-db");
});

Deno.test("parseUri rejects URIs not under root", () => {
  assertEquals(parseUri(ROOT, "other://x/y/z"), null);
});

Deno.test("parseUri rejects unknown types", () => {
  const ts = formatTs(new Date());
  const u = `${ROOT}20260624120000-r/src-auth/badtype/${ts}-abc123.md`;
  assertEquals(parseUri(ROOT, u), null);
});

Deno.test("validate accepts well-formed msg", () => {
  const u = msgUri(ROOT, "20260624120000-r", "src-auth", "x");
  validate(ROOT, u);
});

Deno.test("validate rejects participant-minted pause", () => {
  // hand-craft a pause URI under a non-manager name and confirm it throws
  const ts = formatTs(new Date());
  const nonce = mintNonce();
  const bad = `${ROOT}20260624120000-r/src-auth/pause/${ts}-${nonce}.md`;
  assertThrows(() => validate(ROOT, bad), Error, "manager-only");
});

Deno.test("validate rejects unknown type", () => {
  const ts = formatTs(new Date());
  const nonce = mintNonce();
  const bad = `${ROOT}20260624120000-r/src-auth/whatever/${ts}-${nonce}.md`;
  assertThrows(() => validate(ROOT, bad), Error);
});
```

- [ ] **Step 3: Run tests, confirm all fail**

```sh
deno task test 2>&1 | tail -10
```

Expected: many failures with "is not defined" or import errors (module is empty).

- [ ] **Step 4: Implement `src/protocol.ts`**

```ts
/**
 * @module
 * cc-chat — unified URI grammar for worker-room coordinations.
 *
 *   <root>/<room>/<participant>/<type>/<ts>-<slug>.md
 *   <root>/<room>/meta.md                          (room identity card)
 *
 *   <room>        is <ts>-<slug>, ts = 14-char UTC YYYYMMDDhhmmss,
 *                 slug = [a-z0-9][a-z0-9-]{0,47}
 *   <participant> is [a-z0-9][a-z0-9-]{0,31}
 *   <type>        ∈ { join, msg, pause, resume, end, mention, output }
 *   <slug> on the leaf is [a-z0-9][a-z0-9-]{0,47} or a 6-char base32 nonce
 *
 * Manager-only types: pause, resume, output, and room-closing end.
 * Mention carries a target: <from>/mention/<target>/<ts>-<slug>.md
 *
 * The rig is expected to be backed by persistent storage; meta.md and
 * output must remain readable after their post moment.
 */

export const TYPES = [
  "join", "msg", "pause", "resume", "end", "mention", "output",
] as const;
export type CcChatType = typeof TYPES[number];

export const MANAGER_ONLY_TYPES = ["pause", "resume", "output"] as const;
export type ManagerOnlyType = typeof MANAGER_ONLY_TYPES[number];

export const MANAGER_NAME = "manager";
export const META_LEAF = "meta.md";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TS_RE = /^[0-9]{14}$/;
const NONCE_RE = /^[a-z0-9]{6}$/;
const ROOM_RE = /^([0-9]{14})-([a-z0-9][a-z0-9-]{0,47})$/;
const LEAF_RE = /^([0-9]{14})-([a-z0-9]{6}|[a-z0-9][a-z0-9-]{0,47})\.(md|json)$/;

export function isValidName(name: string): boolean { return NAME_RE.test(name); }
export function isValidSlug(s: string): boolean { return SLUG_RE.test(s); }
export function isValidTs(s: string): boolean { return TS_RE.test(s); }
export function isValidNonce(s: string): boolean { return NONCE_RE.test(s); }
export function isValidRoom(s: string): boolean { return ROOM_RE.test(s); }
export function isValidType(s: string): s is CcChatType {
  return (TYPES as readonly string[]).includes(s);
}
export function isManagerOnly(t: string): t is ManagerOnlyType {
  return (MANAGER_ONLY_TYPES as readonly string[]).includes(t);
}

export function formatTs(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(date.getUTCFullYear()) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

export function mintNonce(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function mintRoom(slug: string, date: Date = new Date()): string {
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
  return `${formatTs(date)}-${slug}`;
}

function requireRoot(root: string): void {
  if (!root) throw new Error("root is required");
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(root)) {
    throw new Error(`root must be a valid URI prefix: ${root}`);
  }
  if (!root.endsWith("/")) throw new Error(`root must end with '/': ${root}`);
}

function requireRoom(room: string): void {
  if (!isValidRoom(room)) throw new Error(`invalid room: ${JSON.stringify(room)}`);
}

function requireName(name: string): void {
  if (!isValidName(name)) throw new Error(`invalid name: ${JSON.stringify(name)}`);
}

function leaf(date: Date | undefined, slugOrNonce: string, ext: "md" | "json"): string {
  const d = date ?? new Date();
  return `${formatTs(d)}-${slugOrNonce}.${ext}`;
}

export function metaUri(root: string, room: string): string {
  requireRoot(root); requireRoom(room);
  return `${root}${room}/${META_LEAF}`;
}

export function joinUri(root: string, room: string, who: string, date?: Date): string {
  requireRoot(root); requireRoom(room); requireName(who);
  return `${root}${room}/${who}/join/${leaf(date, mintNonce(), "json")}`;
}

export function msgUri(root: string, room: string, who: string, slug: string, date?: Date): string {
  requireRoot(root); requireRoom(room); requireName(who);
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${slug}`);
  return `${root}${room}/${who}/msg/${leaf(date, slug, "md")}`;
}

export function pauseUri(root: string, room: string, date?: Date): string {
  requireRoot(root); requireRoom(room);
  return `${root}${room}/${MANAGER_NAME}/pause/${leaf(date, mintNonce(), "md")}`;
}

export function resumeUri(root: string, room: string, date?: Date): string {
  requireRoot(root); requireRoom(room);
  return `${root}${room}/${MANAGER_NAME}/resume/${leaf(date, mintNonce(), "md")}`;
}

export function endUri(root: string, room: string, who: string, date?: Date): string {
  requireRoot(root); requireRoom(room); requireName(who);
  return `${root}${room}/${who}/end/${leaf(date, mintNonce(), "md")}`;
}

export function mentionUri(
  root: string, room: string, from: string, to: string, slug: string, date?: Date,
): string {
  requireRoot(root); requireRoom(room); requireName(from); requireName(to);
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${slug}`);
  return `${root}${room}/${from}/mention/${to}/${leaf(date, slug, "md")}`;
}

export function outputUri(root: string, room: string, slug: string, date?: Date): string {
  requireRoot(root); requireRoom(room);
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${slug}`);
  return `${root}${room}/${MANAGER_NAME}/output/${leaf(date, slug, "md")}`;
}

export type ParsedUri =
  | { type: "meta"; room: string }
  | { type: "join"; room: string; who: string; ts: string; nonce: string }
  | { type: "msg"; room: string; who: string; ts: string; slug: string }
  | { type: "pause"; room: string; who: string; ts: string; nonce: string }
  | { type: "resume"; room: string; who: string; ts: string; nonce: string }
  | { type: "end"; room: string; who: string; ts: string; nonce: string }
  | { type: "mention"; room: string; who: string; target: string; ts: string; slug: string }
  | { type: "output"; room: string; who: string; ts: string; slug: string };

export function parseUri(root: string, uri: string): ParsedUri | null {
  requireRoot(root);
  if (!uri.startsWith(root)) return null;
  const rest = uri.slice(root.length);
  const parts = rest.split("/");

  // <room>/meta.md
  if (parts.length === 2 && parts[1] === META_LEAF) {
    if (!isValidRoom(parts[0])) return null;
    return { type: "meta", room: parts[0] };
  }

  // <room>/<who>/<type>/<leaf>  or  <room>/<who>/mention/<target>/<leaf>
  if (parts.length < 4) return null;
  const [room, who, type] = parts;
  if (!isValidRoom(room)) return null;
  if (!isValidName(who)) return null;
  if (!isValidType(type)) return null;

  if (type === "mention") {
    if (parts.length !== 5) return null;
    const [, , , target, leafStr] = parts;
    if (!isValidName(target)) return null;
    const m = LEAF_RE.exec(leafStr);
    if (!m) return null;
    const [, ts, sn] = m;
    return { type: "mention", room, who, target, ts, slug: sn };
  }

  if (parts.length !== 4) return null;
  const leafStr = parts[3];
  const m = LEAF_RE.exec(leafStr);
  if (!m) return null;
  const [, ts, sn] = m;

  switch (type) {
    case "join":
    case "pause":
    case "resume":
    case "end":
      return { type, room, who, ts, nonce: sn } as ParsedUri;
    case "msg":
    case "output":
      return { type, room, who, ts, slug: sn } as ParsedUri;
  }
  return null;
}

export function validate(root: string, uri: string): void {
  const p = parseUri(root, uri);
  if (!p) throw new Error(`invalid cc-chat URI under ${root}: ${uri}`);
  if (p.type === "meta") return;
  if (isManagerOnly(p.type) && p.who !== MANAGER_NAME) {
    throw new Error(`manager-only type ${p.type} minted by non-manager: ${uri}`);
  }
}
```

- [ ] **Step 5: Run tests, confirm all pass**

```sh
deno task test 2>&1 | tail -10
```

Expected: `26+ passed` (the new test count — should be ~29 after this task; existing roster/tail/client tests still fail because of the grammar change; we'll fix those in their own tasks). For NOW, focus only on protocol tests:

```sh
deno test --allow-all tests/protocol_test.ts 2>&1 | tail -10
```

Expected: all protocol tests pass.

- [ ] **Step 6: Commit**

```sh
git add src/protocol.ts tests/protocol_test.ts
git commit -m "Protocol: unified URI grammar for worker rooms"
```

---

## Task 2: Rewrite `src/roster.ts` (TDD)

**Files:**
- Rewrite: `src/roster.ts`
- Rewrite: `tests/roster_test.ts`

**Interfaces:**
- Consumes: `parseUri`, `ParsedUri` from `./protocol.ts`.
- Produces:
  - `interface ObservedDelivery { uri: string; payload: string | null }` (unchanged)
  - `interface Roster { names: string[]; joined: string[]; spoken: string[] }` (renamed fields; `joined` = ever-seen-join-minus-end, `spoken` = ever-posted-msg)
  - `rosterFromObserved(root: string, deliveries: ObservedDelivery[]): Roster`
  - `gradientStops(lastSeen, now, windowMs)` (unchanged — leave intact)

- [ ] **Step 1: Empty the files**

```sh
: > src/roster.ts
: > tests/roster_test.ts
```

- [ ] **Step 2: Write failing tests**

```ts
import { assert, assertEquals } from "@std/assert";
import {
  gradientStops,
  rosterFromObserved,
} from "../src/roster.ts";
import { joinUri, endUri, msgUri } from "../src/protocol.ts";

const ROOT = "immutable://open/cc-chat/";
const ROOM = "20260624120000-r";

Deno.test("rosterFromObserved derives joined and spoken sets", () => {
  const deliveries = [
    { uri: joinUri(ROOT, ROOM, "src-auth"), payload: null },
    { uri: msgUri(ROOT, ROOM, "src-auth", "hello"), payload: "hello" },
    { uri: joinUri(ROOT, ROOM, "src-db"), payload: null },
  ];
  const r = rosterFromObserved(ROOT, deliveries);
  assertEquals(r.joined, ["src-auth", "src-db"]);
  assertEquals(r.spoken, ["src-auth"]);
  assertEquals(r.names, ["src-auth", "src-db"]);
});

Deno.test("rosterFromObserved subtracts ended participants from joined", () => {
  const deliveries = [
    { uri: joinUri(ROOT, ROOM, "src-auth"), payload: null },
    { uri: endUri(ROOT, ROOM, "src-auth"), payload: null },
    { uri: joinUri(ROOT, ROOM, "src-db"), payload: null },
  ];
  const r = rosterFromObserved(ROOT, deliveries);
  assertEquals(r.joined, ["src-db"]);
  assertEquals(r.names, ["src-auth", "src-db"]); // names = union of ever-seen
});

Deno.test("gradientStops drops entries older than windowMs", () => {
  const lastSeen = new Map<string, number>([["a", 1000], ["b", 500]]);
  const stops = gradientStops(lastSeen, 2000, 1000);
  assertEquals(stops.map((s) => s.name), ["a"]);
});
```

- [ ] **Step 3: Run tests, confirm failure**

```sh
deno test --allow-all tests/roster_test.ts 2>&1 | tail -5
```

Expected: import errors / "not defined".

- [ ] **Step 4: Implement `src/roster.ts`**

```ts
/**
 * @module
 * Client-side roster + warm/cold fade. Pure functions: no rig, no IO.
 * Derived from join (presence in) and end (presence out) URI types.
 */
import { parseUri } from "./protocol.ts";

export interface ObservedDelivery {
  uri: string;
  payload: string | null;
}

export interface Roster {
  names: string[];   // union of ever-seen participants
  joined: string[];  // currently in the room (join minus end)
  spoken: string[];  // ever posted a msg
}

export function rosterFromObserved(
  root: string,
  deliveries: ObservedDelivery[],
): Roster {
  const everSeen = new Set<string>();
  const ins = new Set<string>();
  const outs = new Set<string>();
  const spoken = new Set<string>();
  for (const { uri } of deliveries) {
    const p = parseUri(root, uri);
    if (!p || p.type === "meta") continue;
    everSeen.add(p.who);
    if (p.type === "join") ins.add(p.who);
    else if (p.type === "end") outs.add(p.who);
    else if (p.type === "msg") spoken.add(p.who);
  }
  const joined = [...ins].filter((n) => !outs.has(n)).sort();
  return {
    names: [...everSeen].sort(),
    joined,
    spoken: [...spoken].sort(),
  };
}

export interface GradientStop {
  name: string;
  age: number;
  opacity: number;
}

const FLOOR = 0.18;

export function gradientStops(
  lastSeen: Map<string, number>,
  now: number,
  windowMs: number,
): GradientStop[] {
  const out: GradientStop[] = [];
  for (const [name, ts] of lastSeen) {
    const age = now - ts;
    if (age >= windowMs) continue;
    const k = Math.min(1, age / windowMs);
    const opacity = 1 - k * (1 - FLOOR);
    out.push({ name, age, opacity });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
```

- [ ] **Step 5: Run tests, confirm pass**

```sh
deno test --allow-all tests/roster_test.ts 2>&1 | tail -5
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```sh
git add src/roster.ts tests/roster_test.ts
git commit -m "Roster: derive from join/end URI types"
```

---

## Task 3: Update `src/tail.ts` and `tests/tail_test.ts`

**Files:**
- Modify: `src/tail.ts`
- Modify: `tests/tail_test.ts`

**Interfaces:**
- Consumes: `parseUri`, `ParsedUri` from `./protocol.ts`; `ccChatClient` from `./client.ts`.
- Produces: same `tail()` async-iterator API but yields a `TailDelivery` enriched with `parsed: ParsedUri | null`. Adds a `roomPattern(root, room)` helper for the common case of tailing one room.

- [ ] **Step 1: Inspect existing tail.ts and tail_test.ts**

```sh
cat src/tail.ts
cat tests/tail_test.ts
```

- [ ] **Step 2: Update tail.ts**

```ts
/**
 * @module
 * tail() — async iterator over live cc-chat deliveries on a remote rig.
 * Wraps `ccChatClient.observeStream` and adds a parsed-URI tag per
 * delivery so consumers can switch on type without re-parsing.
 */
import { ccChatClient } from "./client.ts";
import { parseUri, type ParsedUri } from "./protocol.ts";

export interface TailOptions {
  url: string;
  /** URI root, e.g. `immutable://open/cc-chat/`. */
  root?: string;
  /** Subscription pattern, default `${root}**`. */
  pattern?: string;
  signal: AbortSignal;
}

export interface TailDelivery {
  uri: string;
  payload: string | null;
  parsed: ParsedUri | null;
}

export function roomPattern(root: string, room: string): string {
  return `${root}${room}/**`;
}

export async function* tail(opts: TailOptions): AsyncIterable<TailDelivery> {
  const client = ccChatClient({ url: opts.url, root: opts.root });
  const pattern = opts.pattern ?? `${client.root}**`;
  for await (const d of client.observeStream(pattern, opts.signal)) {
    yield { uri: d.uri, payload: d.payload, parsed: parseUri(client.root, d.uri) };
  }
}
```

- [ ] **Step 3: Update tail_test.ts**

Open the file, find the existing tests, replace any URI literals to use the new grammar via mint helpers from `protocol.ts`, and add one assertion that `parsed.type` is populated:

```ts
import { assert, assertEquals } from "@std/assert";
import { tail, roomPattern } from "../src/tail.ts";
import { msgUri } from "../src/protocol.ts";

// Existing test setup likely uses a fake server; preserve its structure.
// Add one assertion:
Deno.test("tail yields parsed delivery", async () => {
  // ... fake rig setup that emits one msgUri delivery ...
  // const d = await iterator.next();
  // assertEquals(d.value?.parsed?.type, "msg");
});

Deno.test("roomPattern builds <root><room>/**", () => {
  assertEquals(
    roomPattern("immutable://open/cc-chat/", "20260624120000-r"),
    "immutable://open/cc-chat/20260624120000-r/**",
  );
});
```

(Adjust the asynchronous test scaffolding to match the existing fake-rig pattern in `tail_test.ts`; copy that pattern verbatim.)

- [ ] **Step 4: Run tail tests**

```sh
deno test --allow-all tests/tail_test.ts 2>&1 | tail -10
```

Expected: pass.

- [ ] **Step 5: Commit**

```sh
git add src/tail.ts tests/tail_test.ts
git commit -m "Tail: yield parsed URIs and expose roomPattern helper"
```

---

## Task 4: Update `src/mod.ts` and verify `src/client.ts` / `tests/client_test.ts`

**Files:**
- Modify: `src/mod.ts`
- Verify (likely no change): `src/client.ts`, `tests/client_test.ts`

**Interfaces:**
- Produces: `src/mod.ts` re-exports all of `protocol`, `client`, `roster`, `tail` so consumers can import from `@bandeira-tech/b3nd-cc-chat`.

- [ ] **Step 1: Read current `src/mod.ts`**

```sh
cat src/mod.ts
```

- [ ] **Step 2: Update re-exports**

Replace contents with:

```ts
export * from "./protocol.ts";
export * from "./client.ts";
export * from "./roster.ts";
export * from "./tail.ts";
```

(Verify no name collisions — there should be none given each module's surface.)

- [ ] **Step 3: Run client_test.ts**

```sh
deno test --allow-all tests/client_test.ts 2>&1 | tail -5
```

Expected: pass. If client_test references `mintStreamUri` or `mintPresenceUri` (old names), update those references to the new mints (`msgUri`, `joinUri`).

- [ ] **Step 4: Run full test suite**

```sh
deno task test 2>&1 | tail -10
```

Expected: every test passes. Record the new count (should be ~29-32 — the protocol set grew slightly, others are roughly preserved).

- [ ] **Step 5: Commit**

```sh
git add src/mod.ts tests/client_test.ts
git commit -m "mod.ts: re-export tail + protocol surface; client_test alignment"
```

---

## Task 5: Update existing plugin commands (join, say, observe, who)

**Files:**
- Rewrite: `plugin/commands/join.md`
- Rewrite: `plugin/commands/say.md`
- Rewrite: `plugin/commands/observe.md`
- Rewrite: `plugin/commands/who.md`

**Interfaces:**
- Consumes: the unified URI grammar (Task 1).
- Produces: agent runbooks that mint to / read from / subscribe to the new grammar.

No automated tests — these are agent instructions in markdown.

- [ ] **Step 1: Rewrite `join.md`**

```markdown
---
description: Join a cc-chat room. Pick a name and announce presence.
argument-hint: <name> [room]
---

You are joining a cc-chat room on the user's currently-configured root.

**Pre-flight:** Verify the b3nd MCP is connected (`b3nd_status` is callable).
If not, follow the cc-chat skill's bootstrap dance before proceeding.

**Root:** If you don't have one in this session, derive it via the
bootstrap dance — `b3nd_status` → inspect `resources.{receive,observe}`
→ `AskUserQuestion` with discovered options. Default suggestion is
`immutable://open/cc-chat/`. Save the chosen root for the session.

**Room:** If `$ARGUMENTS` contains a `<room>` segment (e.g.
`/cc-chat:join researcher 20260624120000-design-review`), use it. If
not, ask the user via `AskUserQuestion` which existing room to join, or
default to the most recent `<root>/*/meta.md` you can observe.

**Name:** the first token of `$ARGUMENTS`, matching `[a-z0-9][a-z0-9-]{0,31}`.
Ask the user if absent or invalid.

Then:

1. Build `<ts>` (UTC `YYYYMMDDhhmmss`) and `<nonce>` (6 base32 chars).
2. Call `b3nd_receive` with `[[ "<root><room>/<name>/join/<ts>-<nonce>.json", "{\"role\":\"observer\"}" ]]`.
3. Open a subscription: `resources/subscribe { uri: "<root><room>/**" }`.
4. Read `<root><room>/meta.md` via `b3nd_read` to learn the room's brief.
5. Tell the user: "Joined `<room>` as `<name>`. Use `/cc-chat:say <text>` to
   speak, `/cc-chat:observe <seconds>` to watch a window, `/cc-chat:who` to
   see who else is around."

Remember `<root>`, `<room>`, and `<name>` for the rest of the session.
```

- [ ] **Step 2: Rewrite `say.md`**

```markdown
---
description: Say something in the cc-chat room.
argument-hint: <text>
---

Send one message under your session name in your active room.

1. If you don't have `<root>`, `<room>`, and `<name>`, run
   `/cc-chat:join` first.
2. Build `<ts>` (UTC `YYYYMMDDhhmmss`) and a short content-derived
   `<slug>` (3-12 chars, `[a-z0-9-]`, lower-cased from the first
   meaningful words of `$ARGUMENTS`). If no slug fits, use a
   6-char nonce.
3. Call `b3nd_receive` with
   `[[ "<root><room>/<name>/msg/<ts>-<slug>.md", "$ARGUMENTS" ]]`.
4. Confirm to the user the URI you sent.
```

- [ ] **Step 3: Rewrite `observe.md` and `who.md`**

Open the existing files, replace their old-grammar subscribe patterns with `<root><room>/**`, and update `who.md` to derive presence from observed `join`/`end` URIs (mirror `rosterFromObserved` semantics in prose).

- [ ] **Step 4: Manual smoke**

If a rig is running, run `/cc-chat:join testname testroom`, then `/cc-chat:say hello`. Confirm via `deno task tail --url http://127.0.0.1:7373` that the URIs land in the new shape.

- [ ] **Step 5: Commit**

```sh
git add plugin/commands/
git commit -m "Commands: rewrite join/say/observe/who for unified grammar"
```

---

## Task 6: Add `plugin/commands/manage-coordination.md`

**Files:**
- Create: `plugin/commands/manage-coordination.md`

**Interfaces:**
- Consumes: the unified URI grammar (Task 1), the `b3nd_receive` / `b3nd_read` / `resources/subscribe` MCP tools, the Claude `Agent` tool for dispatching participants.
- Produces: a single command file that contains (1) the manager runbook and (2) the inlined participant prompt template.

- [ ] **Step 1: Create the file with manager runbook + participant template**

Write the file's body following the spec's Section "Lifecycle / Manager" and Section "Participant template". Use this skeleton (fill in by copying spec content verbatim where the spec already gives prose):

```markdown
---
description: Manage a coordination — dispatch scoped participant subagents and facilitate them toward a deliverable.
argument-hint: <prose: who/what/output>
---

You are the **manager** of a cc-chat coordination.

[... include the full lifecycle from spec section "Lifecycle / Manager", steps 1-10 ...]

## Participant subagent template

When dispatching a participant via the `Agent` tool with
`run_in_background: true`, use this template, interpolating the
per-participant identity/scope/role/tool-budget block at the top:

[... include the full participant template from spec section
"Participant template" verbatim ...]

## End-of-run reporting to the user

After step 10 (close the room), report:
- Deliverable file path (absolute)
- Room URI for replay
- Brief summary of what happened (1-2 paragraphs)
- The ledger path

Then `open` the deliverable file (per CLAUDE.md) so it shows up
in front of the user.
```

Copy the spec's text verbatim for the lifecycle steps and the participant template — do not paraphrase. The spec is the source of truth.

- [ ] **Step 2: Manual review**

```sh
wc -l plugin/commands/manage-coordination.md
```

Expect ~150-250 lines. Read top-to-bottom once and confirm:
- pre-flight scan instruction present (per CLAUDE.md)
- ambiguity detection → one batched AskUserQuestion (per CLAUDE.md)
- tool-budget step references `.claude/cc-chat.local.md`
- participant template includes the JOIN-then-BRIEF-then-INITIATIVE-then-ACTIVE sequence
- failure-mode block in participant template covers rig-unreachable and timeout
- deliverable step writes both chat (`output` URI) AND file
- ledger step appended after step 6 onward

- [ ] **Step 3: Commit**

```sh
git add plugin/commands/manage-coordination.md
git commit -m "Add /cc-chat:manage-coordination command"
```

---

## Task 7: Update `plugin/skills/cc-chat/SKILL.md`

**Files:**
- Modify: `plugin/skills/cc-chat/SKILL.md`

**Interfaces:**
- Consumes: unified grammar and worker-room concept.
- Produces: agent skill teaching the new grammar, the type set, the `meta.md` exception, the persistent-rig assumption, and the worker-room disposition.

- [ ] **Step 1: Read current SKILL.md**

```sh
cat plugin/skills/cc-chat/SKILL.md
```

- [ ] **Step 2: Update sections**

Replace the URI-grammar section with the unified grammar (copy from spec Section "URI grammar"). Add a new section "Worker rooms vs free chat" — half a screen of prose:
- the convention now spans both
- free chat = `/cc-chat:join` + `/cc-chat:say` (you participate as one named user)
- coordinations = `/cc-chat:manage-coordination` (you spawn N participants)
- both mint to the same grammar — the difference is who's at the keyboard

Add the persistence assumption: "cc-chat assumes a persistent rig backend (default root `immutable://open/cc-chat/`). `meta.md` and `output` URIs must remain readable after their post moment."

Add the "do, don't ask" disposition for participants in a coordination.

- [ ] **Step 3: Commit**

```sh
git add plugin/skills/cc-chat/SKILL.md
git commit -m "Skill: teach unified grammar + worker-room disposition"
```

---

## Task 8: Update web UI (`web/index.html`, `web/app.js`)

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`

**Interfaces:**
- Consumes: parsed `TailDelivery` records from the wire (parsing happens client-side).
- Produces: type-aware lanes:
  - `msg` — body line, colored by participant
  - `join` / `end` — thin status row
  - `pause` / `resume` — banner across the room view
  - `mention` — `msg` row with @target badge
  - `output` — highlighted card
  - `meta.md` — fetched on room load, rendered as header strip with goal + participants

- [ ] **Step 1: Read existing app.js**

```sh
cat web/app.js
```

- [ ] **Step 2: Add a parseUri inline (mirror src/protocol.ts shape)**

Since web/app.js is plain JS (browser), and `src/protocol.ts` is Deno TS, we either compile or duplicate. Simplest: duplicate a minimal `parseUri` inline in `app.js` matching the same regex set. Add a comment pointing back to `src/protocol.ts` for the canonical version.

- [ ] **Step 3: Rewrite the row-render function to switch on `parsed.type`**

```js
// in render(delivery): switch on parsed.type
// - msg / mention: full body row with participant color
// - join / end:    thin status row "<who> joined" / "<who> left"
// - pause / resume: banner across the row area
// - output:        highlighted card with the deliverable body
```

- [ ] **Step 4: Add meta.md fetch on room load**

When the page loads with `?room=<room>`, fetch `<root><room>/meta.md` via the rig's HTTP read endpoint and render it as a header strip showing: goal, participants, deliverable destination. Use the existing read-endpoint client code as a model.

- [ ] **Step 5: Manual smoke**

```sh
deno run --allow-net --allow-read --allow-env scripts/say.ts --url http://127.0.0.1:7373 --root immutable://open/cc-chat/ ...
```

(Adjust per Task 9.) Open `http://localhost:8000/?url=http://127.0.0.1:7373&root=immutable://open/cc-chat/&room=<room>` and verify all type lanes render.

- [ ] **Step 6: Commit**

```sh
git add web/
git commit -m "Web UI: type-aware lanes + meta.md header strip"
```

---

## Task 9: Update `scripts/say.ts` and `scripts/tail.ts`

**Files:**
- Modify: `scripts/say.ts`
- Modify: `scripts/tail.ts`

**Interfaces:**
- Consumes: protocol mint helpers + tail iterator.
- Produces:
  - `scripts/say.ts` — flags: `--url <u>`, `--root <r>` (default persistent), `--room <r>`, `--name <n>`, `--type <t>` (default `msg`), `--target <t>` (required when `--type=mention`).
  - `scripts/tail.ts` — flags: `--url <u>`, `--root <r>`, `--room <r>` (optional, narrows the subscription via `roomPattern`).

- [ ] **Step 1: Update say.ts to mint by type**

Add a small switch on `--type` calling `msgUri` / `mentionUri` / `joinUri` / `endUri`. Reject manager-only types from CLI (`pause`, `resume`, `output`) unless `--name manager` is passed.

- [ ] **Step 2: Update tail.ts to narrow by `--room`**

If `--room` is set, use `roomPattern(root, room)` for the subscription; else the default `<root>**`.

- [ ] **Step 3: Manual smoke against running rig**

```sh
deno task say -- --url http://127.0.0.1:7373 --root immutable://open/cc-chat/ --room 20260624120000-t --name alice --type msg "hi"
deno task tail -- --url http://127.0.0.1:7373 --root immutable://open/cc-chat/ --room 20260624120000-t
```

Confirm the URI lands in the new shape.

- [ ] **Step 4: Commit**

```sh
git add scripts/
git commit -m "Scripts: type-aware say + room-narrowed tail"
```

---

## Task 10: Add `tests/coordination_test.ts` (integration, wire-level)

**Files:**
- Create: `tests/coordination_test.ts`

**Interfaces:**
- Consumes: protocol mints, an `ObserveReadNode`-shaped fake rig (mirror `observeStreamFromRig` from `src/client.ts`).
- Produces: an end-to-end wire test of the coordination lifecycle.

- [ ] **Step 1: Build a fake rig**

A small in-memory rig: a Map keyed by URI of `payload`, an `observe()` async generator that emits new URIs as they're received, and a `read()` that returns payloads. Mirror the `ObserveReadNode` interface in `src/client.ts`.

- [ ] **Step 2: Write the lifecycle test**

```ts
import { assert, assertEquals } from "@std/assert";
import {
  metaUri, joinUri, msgUri, pauseUri, resumeUri, endUri, outputUri,
  parseUri, mintRoom,
} from "../src/protocol.ts";

const ROOT = "immutable://open/cc-chat/";

Deno.test("coordination lifecycle on the wire", async () => {
  const room = mintRoom("design-review");
  const rig = makeFakeRig(); // helper defined in the test file

  // 1. Manager mints meta.md
  await rig.receive(metaUri(ROOT, room), "---\nroom: " + room + "\n---\n# Goal\n...");

  // 2. Manager joins
  await rig.receive(joinUri(ROOT, room, "manager"), '{"role":"manager"}');

  // 3. Two participants join
  await rig.receive(joinUri(ROOT, room, "src-auth"), '{"scope":"src/auth","role":"x"}');
  await rig.receive(joinUri(ROOT, room, "src-db"), '{"scope":"src/db","role":"y"}');

  // 4. Initiative msgs
  await rig.receive(msgUri(ROOT, room, "src-auth", "starting"), "looking into auth flow");
  await rig.receive(msgUri(ROOT, room, "src-db", "starting"), "schema notes incoming");

  // 5. Manager pauses, resumes
  await rig.receive(pauseUri(ROOT, room), "checking with user");
  await rig.receive(resumeUri(ROOT, room), "");

  // 6. Manager outputs deliverable
  await rig.receive(outputUri(ROOT, room, "deliverable"), "# Deliverable\n...");

  // 7. Manager ends room
  await rig.receive(endUri(ROOT, room, "manager"), "");

  // Verify: read everything back, parse, count types
  const uris = rig.allUris();
  const parsed = uris.map((u) => parseUri(ROOT, u)).filter((p) => p !== null);
  const counts = parsed.reduce<Record<string, number>>((acc, p) => {
    acc[p!.type] = (acc[p!.type] ?? 0) + 1; return acc;
  }, {});
  assertEquals(counts.meta, 1);
  assertEquals(counts.join, 3);  // manager + 2 participants
  assertEquals(counts.msg, 2);
  assertEquals(counts.pause, 1);
  assertEquals(counts.resume, 1);
  assertEquals(counts.output, 1);
  assertEquals(counts.end, 1);
});

function makeFakeRig() {
  const store = new Map<string, string>();
  return {
    async receive(uri: string, payload: string) { store.set(uri, payload); },
    async read(uris: string[]): Promise<[string, string | null][]> {
      return uris.map((u) => [u, store.get(u) ?? null]);
    },
    allUris() { return [...store.keys()]; },
  };
}
```

- [ ] **Step 3: Run the test**

```sh
deno test --allow-all tests/coordination_test.ts 2>&1 | tail -5
```

Expected: pass.

- [ ] **Step 4: Commit**

```sh
git add tests/coordination_test.ts
git commit -m "Tests: coordination wire-level integration test"
```

---

## Task 11: Update docs

**Files:**
- Modify: `docs/contract.md` — new grammar section, type vocabulary, meta.md special case, worker-room shift
- Modify: `docs/architecture.md` — update "how a say lands"; add "how a coordination lands"
- Modify: `docs/cookbook.md` — add recipes: starting a coordination, joining mid-flight as a human via web UI, using pause/resume, reading deliverable post-hoc, re-dispatching a participant
- Modify: `docs/usage.md` — UI/tail URL examples with `<room>` narrowing
- Modify: `docs/design.md` — update file-by-file what shipped
- Modify: `docs/lab.md` — append a coordination-design retrospective note
- Modify: `docs/demo.md` — update transcript references
- Modify: `docs/problem.md` — note the worker-room mode alongside present chat
- Modify: `README.md` — top-level: mention `/cc-chat:manage-coordination`, the unified grammar, default persistent root

**Interfaces:** prose only; no automated tests.

- [ ] **Step 1: Update contract.md** (the most important doc — it defines the convention)

Copy URI grammar text and type table from the spec verbatim. Add a "Persistent worker rooms" paragraph noting the shift from present-leaning chat to persistent worker rooms. Note `meta.md` as a deliberate special case.

- [ ] **Step 2: Update architecture.md**

Keep the existing diagram; add a second diagram for "how a coordination lands" — manager dispatches N subagents, each subagent runs a long-running Agent call, posts to its own URI sublane, listens to others. Include the receive/observe/read flow per type.

- [ ] **Step 3: Add coordination recipes to cookbook.md**

Concrete recipes with exact MCP / CLI calls:
- "Start a coordination on three folders to design X"
- "Watch a coordination from the web UI"
- "Inject a question into a running coordination as the user"
- "Read the deliverable after the room closes"
- "Re-dispatch a participant that timed out"

- [ ] **Step 4: Update remaining docs**

Walk each file (usage.md, design.md, lab.md, demo.md, problem.md, README.md), replace old-grammar references, add coordination references where natural. Each doc gets its own commit if it's a meaningful change; trivial typo-level edits can be batched.

- [ ] **Step 5: Commit**

```sh
git add docs/ README.md
git commit -m "Docs: rewrite for unified grammar and worker rooms"
```

- [ ] **Step 6: Open the updated docs and skim**

```sh
open docs/contract.md docs/architecture.md docs/cookbook.md README.md
```

Read each one as if you've never seen cc-chat. Anything confusing → fix in a follow-up commit.

---

## Task 12: End-to-end smoke run

**Files:** none modified — this is a manual verification step.

**Interfaces:** verifies that all prior tasks compose into a working feature.

- [ ] **Step 1: Start a rig**

```sh
# either via b3nd plugin's /b3nd:install, or hand-roll per docs/bootstrap.md
```

Confirm `http://127.0.0.1:7373/api/v1/observe` accepts requests.

- [ ] **Step 2: Run `/cc-chat:manage-coordination` against a small real scope**

In a Claude Code session inside `/Users/m0/ws/b3nd-cc-chat`:

```
/cc-chat:manage-coordination discuss between src/protocol.ts and src/roster.ts whether the type set is right; produce a short opinion note as .cc-chat/<room>/output.md
```

- [ ] **Step 3: Watch via tail**

```sh
deno task tail -- --url http://127.0.0.1:7373 --root immutable://open/cc-chat/
```

Confirm: meta.md is minted, manager joins, both participants join, initiative msgs arrive, msgs flow, you can post a `[user] ...` via `scripts/say.ts`, manager drafts and posts `output`, manager `end`s.

- [ ] **Step 4: Watch via web UI**

```sh
open "http://localhost:8000/?url=http://127.0.0.1:7373&root=immutable://open/cc-chat/&room=<room>"
```

Confirm: meta strip renders, lanes render correctly, output card is highlighted.

- [ ] **Step 5: Open the deliverable**

```sh
open .cc-chat/<room>/output.md
```

Confirm content matches the chat `output` URI's payload.

- [ ] **Step 6: Run full test suite one last time**

```sh
deno task test
```

Expected: all pass.

- [ ] **Step 7: Final commit (if anything fell out of smoke)**

```sh
git add -A
git commit -m "Smoke: fixes from end-to-end run"
```

---

## Verification findings

(Filled in during Task 0. Subsequent tasks read this section.)

- observe multi-pattern: **YES** — `HttpClient.observe(urls: string[], signal)` in
  `/Users/m0/ws/b3nd-move/src/http/client.ts:269` takes `string[]`. The existing
  `client.ts` already passes `[pattern]`; participants can subscribe to a list of globs
  (e.g. `["<root><room>/*/msg/**", "<root><room>/manager/pause/**"]`) in a single call.
  Verified from local sibling repo source (deno doc JSON was not used).

- MCP subscribe multi-pattern: **NO** — `resources/subscribe` in
  `/Users/m0/ws/b3nd-move/src/mcp/service.ts:201` accepts exactly one `{ uri }` per
  call. To subscribe to multiple patterns via MCP, callers must issue multiple
  `resources/subscribe` calls. For cc-chat plugin commands the simpler approach is to
  subscribe to `<root><room>/**` (one call) and filter client-side.

- plugin-settings frontmatter shape: Free-form YAML key:value — no enforced schema
  beyond the `.claude/plugin-name.local.md` file location convention. Verified from
  `/Users/m0/.claude/plugins/cache/claude-plugins-official/plugin-dev/27d2b86d72da/skills/plugin-settings/SKILL.md`.
  Minimal cc-chat shape:
  ```yaml
  ---
  participant-tool-budget: read-only-chat   # read-only-chat | full-this-run | full-always
  ---
  ```

- persistence under `immutable://open/cc-chat/`: **ASSUMED** — `immutable://` is the
  rig's append-only scheme; `docs/bootstrap.md:46` states "append-only — best for chat"
  and shows fs-backed storage mapping `immutable://open/cc-chat/` to a local directory.
  The rig is running healthy at `http://127.0.0.1:7373` but no live write-wait-read test
  was performed (no >60s wait in a pre-flight task). Downstream tasks should treat
  persistence as an assumption justified by the scheme name and the README, not a
  live-verified fact.
