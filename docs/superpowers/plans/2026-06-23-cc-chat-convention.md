# cc-chat as a Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn cc-chat from a bundled server + custom MCP into a pure convention — a *relative* URI grammar mounted under an operator-supplied root, a client library, a parameterized web UI, and Claude Code skills/commands that ride on top of any user-controlled b3nd rig (via the `bandeira-tech/b3nd` plugin or a hand-rolled local rig).

**Architecture:** Delete the in-repo rig (`PresentChatNode`, `serve.ts`, the custom MCP). Keep only: (a) a relative URI-shape library — cc-chat owns `<channel>/<name>/<seq>` where channel is `stream` or `presence`; the operator/mount supplies the absolute root (scheme + host + base path), (b) client-side helpers for the standard subscribe → observe → poll fallback and client-side roster derivation, (c) a web UI shaped as `fn(targetRemote, rootPath)`, (d) CLI senders/viewers parameterized the same way, (e) a Claude Code plugin that ships skills/commands only — no MCP server, no bundled rig. The cc-chat skill teaches agents a bootstrap dance: probe local → ask user → offer one of three setup paths (recommend `bandeira-tech/b3nd` plugin install, or hand-roll a local rig over `b3nd-save/fs` with file-layout preview, or hand-roll over a user-chosen backend). The same app code runs unchanged whether mounted at `cc-chat://`, `chat://team-a/`, `workspace://abcd/`, or `https://example.com/rooms/x/`.

**Tech Stack:** Deno 2.x. `@bandeira-tech/b3nd-core@^0.22.0` (types + ObserveEmitter, used in tests only). `@bandeira-tech/b3nd-move@^0.18.0` HTTP client. Vanilla JS web UI (no framework). Claude Code plugin (skills + commands, markdown).

## Global Constraints

- **No rig in this repo.** No `Deno.serve`, no `httpApi(rig)` host, no `PresentChatNode`. The cc-chat package is a library + UI + plugin only.
- **No custom server methods on any wire.** Agents and clients use stock `b3nd_receive` / `b3nd_read` / `b3nd_status` / `resources/subscribe`. cc-chat-specific behavior (block-and-collect observe, roster derivation, fade) is *client-side* on top of those verbs.
- **Web UI = `fn(targetRemote, rootPath)`.** Both manageable via URL params (`?url=…&root=cc-chat://`) and a settings panel; persisted to `localStorage`. The UI cannot enforce the contract — it only renders deliveries that arrive.
- **Liveliness = self-report.** Participants announce by posting `cc-chat://presence/<name>/<seq>` or by speaking on `cc-chat://stream/<name>/<seq>`. The UI ranks names by recency with a warm → cold gradient. No server-enforced presence.
- **Subscribe → observe → poll fallback.** Client first tries the transport's subscription primitive; failing that, it uses b3nd-core `observe` streaming; failing that, it polls `read` on a known URI set. Never a server-side workaround.
- **Root is operator-supplied; the protocol library has no default scheme.** cc-chat owns only the *relative* path shape under a chosen root: `stream/<name>/<seq>` and `presence/<name>/<seq>`. The operator decides scheme + host + any base path when they mount the app on their rig. `cc-chat://` is a *suggested starting root* offered by the bootstrap skill and shown as a placeholder/initial value in the UI — it is not part of the protocol. The same app code runs unchanged at `cc-chat://`, `chat://team-a/`, `workspace://abcd/`, or any other root the operator picks.
- **Validation lives in the shared contract.** `src/protocol.ts` takes the root as a required argument; senders mint to spec, observers parse to spec. Malformed URIs are invisible to filtered observers, not "noise" — the subscription pattern excludes them.
- **The `bandeira-tech/b3nd` plugin is the official path.** Its MCP server is at `~/ws/plugins.bandeira.tech/b3nd/.claude-plugin/mcp-server/bnd-mcp.sh` and exposes `b3nd_receive` / `b3nd_read` / `b3nd_status` / `resources/subscribe` against the user's `bnd`-configured rig. The cc-chat plugin recommends installing it, does not bundle it.
- **Hand-roll-over-fs path must show its work.** When offering the `b3nd-save/fs` option, the agent must ask the user for the filesystem root and preview the on-disk layout (e.g. `<fsRoot>/cc-chat_stream/<name>/<seq>.bin`) so the user can decide before committing.
- **Discovery is structured, not flat.** A rig's `b3nd_status` carries a structured `resources: { read?, observe?, receive? }` advertising URI prefixes it serves *per verb*. The rig aggregates from downstream nodes (each node self-reports its own); custom clients self-report whatever they want to expose. Asymmetric mounts (write-only ingest, read-only views) report faithfully. cc-chat's bootstrap reads `resources.receive` ∩ `resources.observe` to find places where a chat can both be written to and observed live. **This requires landing Task 0 upstream first.**
- **Setup interactions use `AskUserQuestion`, not open-ended prompts.** After the cc-chat skill has diagnosed what is available (rig present? open mounts on offer? which backends installable?), it presents the choices as a structured multi-choice question — not "what do you want?". Better UX, traceable answers.
- **Frequent commits.** One commit per task (sometimes per logical sub-step). Commits push to origin when configured.

---

## File Structure

**Files deleted:**
- `src/node.ts` — PresentChatNode class.
- `src/rig.ts` — createCcChatRig factory.
- `src/serve.ts` — Deno HTTP listener + static mux.
- `tests/node_test.ts` — node unit tests.
- `tests/serve_test.ts` — HTTP serve wire round-trip tests.
- `tests/e2e_claude_test.ts` — bundled-MCP e2e harness.
- `plugin/.claude-plugin/mcp-server/` — the entire bundled MCP server tree.

**Files created:**
- `src/client.ts` — `ccChatClient(opts)`: subscribe → observe → poll fallback wrapper. Exposes `observeStream(pattern, signal)` returning `AsyncIterable<{uri, payload}>`.
- `src/roster.ts` — moved from `src/observe-window.ts`: warm/cold gradient utilities + `rosterFromObserved`.
- `tests/client_test.ts` — unit tests for the fallback chain against a stub `ProtocolInterfaceNode`.
- `tests/roster_test.ts` — moved/renamed from `observe_window_test.ts`.
- `docs/bootstrap.md` — explains the three setup paths the skill offers.
- `docs/contract.md` — the cc-chat convention: URI grammar, root path, expectations, present-only vs persistent deployments.

**Files modified:**
- `src/mod.ts` — re-export `protocol`, `client`, `roster`. Drop `node`, `rig`.
- `src/protocol.ts` — accept a configurable URI scheme root (default `cc-chat://`) so the same library works under non-default roots.
- `src/tail.ts` — accept `{ url, root, pattern, signal }`; remove default `cc-chat://**` baked-in pattern in favor of `${root}**`.
- `scripts/tail.ts` — `--url`, `--root`, `--pattern`.
- `scripts/say.ts` — `--url`, `--root`; existing `--presence` stays.
- `web/index.html` — add settings panel UI; remove the meta tag for the rig URL.
- `web/app.js` — replace fixed `RIG_URL`/`PATTERN_ALL` with `(targetRemote, rootPath)` from URL params + localStorage; show settings panel.
- `deno.json` — drop `./node`, `./http`, `./mcp` exports; add `./client`, `./roster`; drop the `serve` task; keep `tail`, `say`, `test`.
- `plugin/.claude-plugin/plugin.json` — drop `mcpServers` block, raise dependency on `bandeira-tech/b3nd` plugin (or document it in README).
- `plugin/.claude-plugin/marketplace.json` — drop MCP references.
- `plugin/skills/cc-chat/SKILL.md` — rewrite as the convention + bootstrap dance.
- `plugin/commands/join.md`, `say.md`, `observe.md`, `who.md` — rewrite to use the b3nd plugin's tools with cc-chat URI shapes, and to delegate observe to the subscribe → observe → poll fallback.
- `README.md`, `docs/architecture.md`, `docs/usage.md`, `docs/cookbook.md`, `docs/design.md`, `docs/demo.md` — reflect the convention-only model.

---

## Task 0 (upstream): Land `StatusResult.resources` across the b3nd packages

This task is a prerequisite for the cc-chat skill's discovery flow. Commits
land in sibling repos in `~/ws/`, not in `b3nd-cc-chat`.

**Files (across repos):**
- Modify: `~/ws/b3nd-core/src/types/types.ts` — add `resources` to `StatusResult`.
- Modify: `~/ws/b3nd-core/src/rig/rig.ts` — aggregate `resources` across downstream node statuses (~line 987).
- Modify: `~/ws/b3nd-save/src/fs/store.ts` — self-report `resources.{read,observe,receive}` for the prefix the store is mounted at.
- Modify: `~/ws/b3nd-save/src/memory/store.ts` — same.
- Modify: `~/ws/b3nd-move/src/mcp/service.ts` — only if `resources/list` needs adjusting; the field round-trips through `JSON.stringify(result)` already.
- Modify: `~/ws/b3nd-move/src/http/status.ts` — same; verify the field passes through `json(body, …)`.
- Add: tests in each repo for the new field.

**Interfaces:**
- Consumes: nothing.
- Produces: every rig that uses the standard nodes (or whose custom nodes opt in) advertises mount prefixes per verb. Shape:

```ts
export interface ResourceCapabilities {
  /** URI prefixes this node can serve `read` on. */
  read?: string[];
  /** URI prefixes this node can serve `observe` on. */
  observe?: string[];
  /** URI prefixes this node accepts on `receive`. */
  receive?: string[];
}

export interface StatusResult {
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  schema?: string[];
  fns?: string[];
  resources?: ResourceCapabilities;
  details?: Record<string, unknown>;
}
```

- [ ] **Step 1: Confirm current `StatusResult` shape**

```bash
sed -n '40,55p' ~/ws/b3nd-core/src/types/types.ts
```

Expected output matches what's documented above (no `resources` field yet).

- [ ] **Step 2: Write a failing test in b3nd-core for the aggregated `resources`**

Create or extend `~/ws/b3nd-core/src/rig/rig.test.ts` with:

```ts
Deno.test("Rig aggregates resources from downstream nodes per verb", async () => {
  const a: ProtocolInterfaceNode = {
    async receive() { return []; },
    async read() { return []; },
    async *observe() {},
    async status() {
      return {
        status: "healthy",
        resources: {
          receive: ["immutable://open/"],
          observe: ["immutable://open/"],
          read: ["immutable://open/"],
        },
      };
    },
  };
  const b: ProtocolInterfaceNode = {
    async receive() { return []; },
    async read() { return []; },
    async *observe() {},
    async status() {
      return {
        status: "healthy",
        resources: { receive: ["mutable://open/"], read: ["mutable://open/"] },
      };
    },
  };
  const rig = new Rig({
    routes: {
      receive: [connection(a, ["immutable://open/**"]), connection(b, ["mutable://open/**"])],
      read:    [connection(a, ["immutable://open/**"]), connection(b, ["mutable://open/**"])],
      observe: [connection(a, ["immutable://open/**"])],
    },
  });
  const s = await rig.status();
  assertEquals(new Set(s.resources?.receive), new Set(["immutable://open/", "mutable://open/"]));
  assertEquals(new Set(s.resources?.read),    new Set(["immutable://open/", "mutable://open/"]));
  assertEquals(new Set(s.resources?.observe), new Set(["immutable://open/"]));
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd ~/ws/b3nd-core && deno test src/rig/rig.test.ts`
Expected: FAIL — `s.resources` is undefined.

- [ ] **Step 4: Extend `StatusResult` in `types/types.ts`**

After the existing `fns?: string[];` line, add:

```ts
  /**
   * URI prefixes this node serves, per verb. Rigs aggregate this from
   * downstream nodes (each node self-reports its own). Custom clients
   * may report whatever they choose to expose. Asymmetric mounts (e.g.
   * write-only ingest) report faithfully — a prefix may appear under
   * one verb and not another.
   *
   * Discovery clients (UIs, agents) use this to find places where they
   * can mount or observe. For example, a chat looks for prefixes that
   * appear in both `receive` and `observe`.
   */
  resources?: ResourceCapabilities;
```

Above `StatusResult`, declare the helper interface:

```ts
export interface ResourceCapabilities {
  read?: string[];
  observe?: string[];
  receive?: string[];
}
```

- [ ] **Step 5: Aggregate `resources` in `rig.ts`**

Locate the `status()` method around line 987. After the existing `allSchema`/`allFns` aggregation, add (using the per-verb route lists — `receive`, `read`, `observe`):

```ts
// Aggregate resources, but only count a prefix toward a verb if the
// reporting node is wired into the rig's routes for that verb.
function indexByClient(list: typeof receive) {
  const m = new Map<ProtocolInterfaceNode, Set<string>>();
  for (const conn of list) {
    let set = m.get(conn.client);
    if (!set) { set = new Set(); m.set(conn.client, set); }
    for (const p of conn.patterns) set.add(p);
  }
  return m;
}

const verbRoutes = {
  read:    indexByClient(read),
  observe: indexByClient(observe),
  receive: indexByClient(receive),
};

const merged: ResourceCapabilities = {};
for (const c of unique) {
  const r = (await c.status()).resources;
  if (!r) continue;
  for (const verb of ["read", "observe", "receive"] as const) {
    if (!verbRoutes[verb].has(c)) continue;
    const reported = r[verb] ?? [];
    if (reported.length === 0) continue;
    (merged[verb] ??= []).push(...reported);
  }
}
// De-dupe.
for (const verb of ["read", "observe", "receive"] as const) {
  if (merged[verb]) merged[verb] = [...new Set(merged[verb]!)];
}
```

(Adapt to the exact local names — `unique`, `receive`, `read`, `observe` lists already exist in scope. Note this requires not calling `c.status()` twice; refactor so the existing `results` array is the source for both schema/fns and resources.)

Add `resources: merged` to each of the three return branches (`unhealthy`, `degraded`, healthy).

- [ ] **Step 6: Run the test, confirm pass**

Run: `cd ~/ws/b3nd-core && deno test src/rig/rig.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit in b3nd-core**

```bash
cd ~/ws/b3nd-core
git add src/types/types.ts src/rig/rig.ts src/rig/rig.test.ts
git commit -m "Status: structured resources {read, observe, receive} for mount discovery"
```

- [ ] **Step 8: Bump the b3nd-core version in `~/ws/b3nd-core/deno.json`**

Bump minor version (e.g. `0.22.0 → 0.23.0`). Run `deno publish --dry-run` to confirm.

- [ ] **Step 9: Self-report from `b3nd-save/fs`**

In `~/ws/b3nd-save/src/fs/store.ts`'s `status()` (around line 385), add the configured mount prefix to `result.resources` for whichever verbs the store implements (typically all three). Worked example:

```ts
return {
  status: "healthy",
  // … existing fields …
  resources: this.mountPrefix
    ? { read: [this.mountPrefix], observe: [this.mountPrefix], receive: [this.mountPrefix] }
    : undefined,
};
```

If the FS store doesn't already accept a mount prefix in its constructor, add one as an optional config option. Document it.

Add a test in `~/ws/b3nd-save/src/fs/store.test.ts` that constructs with `mountPrefix: "immutable://open/"` and asserts the returned status.

- [ ] **Step 10: Same for `b3nd-save/memory`**

Mirror the FS change in `~/ws/b3nd-save/src/memory/store.ts`. Same test pattern.

- [ ] **Step 11: Commit in b3nd-save**

```bash
cd ~/ws/b3nd-save
git add src/fs src/memory
git commit -m "Stores: self-report mount prefix in StatusResult.resources"
```

Bump version + dry-run publish similarly.

- [ ] **Step 12: Verify HTTP + MCP wire round-trip**

`b3nd-move`'s HTTP and MCP services already serialize `StatusResult` via `JSON.stringify` — the new field rides along automatically. Add a regression test in each:

`~/ws/b3nd-move/src/http/status.test.ts`:

```ts
Deno.test("status response round-trips resources field", async () => {
  const rig = makeRigWithResources({ receive: ["immutable://open/"] });
  const res = await statusHandler(new Request("http://x/api/v1/status"), rig);
  const body = await res.json();
  assertEquals(body.resources?.receive, ["immutable://open/"]);
});
```

Same in `~/ws/b3nd-move/src/mcp/service.test.ts` (invoke `b3nd_status` through the in-memory MCP test harness; parse the JSON response).

- [ ] **Step 13: Commit in b3nd-move**

```bash
cd ~/ws/b3nd-move
git add src/http src/mcp
git commit -m "Status: regression-test resources field round-trip on HTTP and MCP"
```

- [ ] **Step 14: Bump the cc-chat repo's dependency floor**

In `/Users/m0/ws/b3nd-cc-chat/deno.json`, bump `@bandeira-tech/b3nd-core` to the new minor version published in Step 8. Run `deno task test` to confirm nothing breaks.

```bash
cd /Users/m0/ws/b3nd-cc-chat
git add deno.json
git commit -m "Bump b3nd-core to pick up StatusResult.resources"
```

- [ ] **Step 15: End-to-end smoke**

Start a `bnd node --http :7373` rig wired to an FS store mounted at `immutable://open/`. Then:

```bash
curl -fsS http://127.0.0.1:7373/api/v1/status | jq .resources
```

Expected:

```json
{
  "read": ["immutable://open/"],
  "observe": ["immutable://open/"],
  "receive": ["immutable://open/"]
}
```

If empty or missing, fix the store's `status()` before continuing.

---

## Task 1: Delete the server-side rig

**Files:**
- Delete: `src/node.ts`, `src/rig.ts`, `src/serve.ts`
- Delete: `tests/node_test.ts`, `tests/serve_test.ts`, `tests/e2e_claude_test.ts`
- Modify: `src/mod.ts`, `deno.json`

**Interfaces:**
- Consumes: none
- Produces: `src/mod.ts` re-exports only `protocol` and (after Task 2) `client` and `roster`.

- [ ] **Step 1: Read current `src/mod.ts` to see what survives**

```bash
cat /Users/m0/ws/b3nd-cc-chat/src/mod.ts
```

Expected: shows re-exports including `node` and `rig`. Note them so the rewrite below removes them.

- [ ] **Step 2: Delete server-side source files**

```bash
git -C /Users/m0/ws/b3nd-cc-chat rm src/node.ts src/rig.ts src/serve.ts
```

Expected: three files removed and staged for deletion.

- [ ] **Step 3: Delete server-side tests**

```bash
git -C /Users/m0/ws/b3nd-cc-chat rm tests/node_test.ts tests/serve_test.ts tests/e2e_claude_test.ts
```

Expected: three test files staged for deletion.

- [ ] **Step 4: Rewrite `src/mod.ts` to re-export only the surviving pieces**

Replace `src/mod.ts` with:

```ts
/**
 * @module
 * cc-chat — a convention over b3nd. No server. Senders mint URIs to the
 * grammar, observers subscribe to a root, the rig (any b3nd rig) routes
 * the bytes. See docs/contract.md.
 */
export * from "./protocol.ts";
export * from "./client.ts";
export * from "./roster.ts";
```

(Note: `./client.ts` and `./roster.ts` will exist after Tasks 2 and 3. This deliberately produces a temporarily broken `mod.ts` to be repaired by the next task — that's acceptable because no test imports `mod.ts` directly.)

- [ ] **Step 5: Update `deno.json` to remove server tasks and exports**

Replace `deno.json` with:

```json
{
  "name": "@bandeira-tech/b3nd-cc-chat",
  "version": "0.1.0",
  "exports": {
    ".": "./src/mod.ts",
    "./protocol": "./src/protocol.ts",
    "./client": "./src/client.ts",
    "./roster": "./src/roster.ts"
  },
  "imports": {
    "@bandeira-tech/b3nd-core": "jsr:@bandeira-tech/b3nd-core@^0.22.0",
    "@bandeira-tech/b3nd-move": "jsr:@bandeira-tech/b3nd-move@^0.18.0",
    "@std/assert": "jsr:@std/assert@^1.0.15"
  },
  "tasks": {
    "test": "deno test --allow-all tests/",
    "tail": "deno run --allow-net --allow-env scripts/tail.ts",
    "say": "deno run --allow-net scripts/say.ts"
  },
  "compilerOptions": {
    "strict": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable", "deno.ns"]
  }
}
```

- [ ] **Step 6: Verify the cut**

Run: `ls /Users/m0/ws/b3nd-cc-chat/src/`
Expected: shows only `mod.ts`, `protocol.ts`, `observe-window.ts`, `tail.ts`. (`observe-window.ts` is still there; Task 2 splits it.)

Run: `git -C /Users/m0/ws/b3nd-cc-chat status --short`
Expected: deletions of node.ts, rig.ts, serve.ts, the three test files, plus modifications to mod.ts and deno.json.

- [ ] **Step 7: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add -A
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Remove bundled rig: cc-chat becomes a client-side convention"
```

Expected: a single commit removing the server-side files and trimming mod.ts + deno.json.

---

## Task 2: Split `observe-window.ts` into `client.ts` + `roster.ts`

**Files:**
- Create: `src/client.ts`
- Create: `src/roster.ts`
- Create: `tests/client_test.ts`
- Create: `tests/roster_test.ts`
- Delete: `src/observe-window.ts`, `tests/observe_window_test.ts`

**Interfaces:**
- Consumes: `@bandeira-tech/b3nd-move/http/client` (`HttpClient`), `@bandeira-tech/b3nd-core` (`ProtocolInterfaceNode` type for stub typing in tests).
- Produces:
  - `client.ts`: `ccChatClient(opts: { url: string; root?: string }) → { observeStream, send, read, status }` where `observeStream(pattern, signal): AsyncIterable<{uri, payload: string|null}>` implements the subscribe → observe → poll fallback.
  - `roster.ts`: `rosterFromObserved(deliveries)` → `{names, speaking, presence}` (unchanged) and `gradientStops(seenMap, now, windowMs)` → `Array<{name, age, opacity}>` for the warm/cold UI fade.

- [ ] **Step 1: Read the existing helpers so the move preserves behavior**

```bash
cat /Users/m0/ws/b3nd-cc-chat/src/observe-window.ts
```

Expected: shows `observeWindow` + `rosterFromObserved` as currently defined.

- [ ] **Step 2: Write failing tests for `roster.ts`**

Create `tests/roster_test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { gradientStops, rosterFromObserved } from "../src/roster.ts";

Deno.test("rosterFromObserved separates speaking and presence under a root", () => {
  const r = rosterFromObserved("cc-chat://", [
    { uri: "cc-chat://presence/researcher/20260623-aaa", payload: "join" },
    { uri: "cc-chat://stream/writer/20260623-bbb", payload: "hi" },
    { uri: "cc-chat://presence/writer/20260623-ccc", payload: "join" },
  ]);
  assertEquals(r.names, ["researcher", "writer"]);
  assertEquals(r.speaking, ["writer"]);
  assertEquals(r.presence, ["researcher", "writer"]);
});

Deno.test("rosterFromObserved works under an operator-chosen root", () => {
  const r = rosterFromObserved("workspace://abcd/", [
    { uri: "workspace://abcd/stream/alice/20260623-bbb", payload: "hi" },
    { uri: "cc-chat://stream/wrong-root/20260623-ccc", payload: "hi" }, // ignored
  ]);
  assertEquals(r.names, ["alice"]);
  assertEquals(r.speaking, ["alice"]);
});

Deno.test("gradientStops maps age to opacity, drops expired", () => {
  const now = 10_000;
  const seen = new Map([
    ["fresh", 10_000],     // age 0
    ["mid", 5_000],        // age 5000
    ["stale", 0],          // age 10_000 — outside 9000 window
  ]);
  const stops = gradientStops(seen, now, 9_000);
  assertEquals(stops.length, 2);
  assertEquals(stops[0].name, "fresh");
  assertEquals(stops[0].opacity, 1);
  assertEquals(stops[1].name, "mid");
  // 5000/9000 fade → opacity > 0.18 floor, < 1
  if (!(stops[1].opacity > 0.18 && stops[1].opacity < 1)) {
    throw new Error(`bad opacity ${stops[1].opacity}`);
  }
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `cd /Users/m0/ws/b3nd-cc-chat && deno test tests/roster_test.ts`
Expected: FAIL — `src/roster.ts` does not exist.

- [ ] **Step 4: Create `src/roster.ts`**

```ts
/**
 * @module
 * Client-side roster + warm/cold fade. Pure functions: no rig, no IO.
 * Takes the operator-chosen root explicitly — there is no protocol-level
 * default scheme.
 */

export interface ObservedDelivery {
  uri: string;
  payload: string | null;
}

export interface Roster {
  names: string[];
  speaking: string[];
  presence: string[];
}

function rosterRegex(root: string): RegExp {
  if (!root.endsWith("/")) throw new Error(`root must end with '/', got: ${root}`);
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(stream|presence)\\/([a-z0-9][a-z0-9-]{0,31})\\/`);
}

export function rosterFromObserved(
  root: string,
  deliveries: ObservedDelivery[],
): Roster {
  const re = rosterRegex(root);
  const speakingSet = new Set<string>();
  const presenceSet = new Set<string>();
  for (const { uri } of deliveries) {
    const m = re.exec(uri);
    if (!m) continue;
    const [, channel, name] = m;
    if (channel === "stream") speakingSet.add(name);
    else if (channel === "presence") presenceSet.add(name);
  }
  const names = [...new Set([...speakingSet, ...presenceSet])].sort();
  return { names, speaking: [...speakingSet].sort(), presence: [...presenceSet].sort() };
}

export interface GradientStop {
  name: string;
  age: number;
  opacity: number;
}

const FLOOR = 0.18;

/**
 * Map name → last-seen-ms to an array of `{name, age, opacity}` sorted by
 * name. Anything older than `windowMs` is dropped. Opacity decays linearly
 * from 1 to `FLOOR` over the window.
 */
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

- [ ] **Step 5: Run the roster test, confirm it passes**

Run: `deno test tests/roster_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write failing tests for `client.ts`**

Create `tests/client_test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { observeStreamFromRig } from "../src/client.ts";
import { ObserveEmitter } from "@bandeira-tech/b3nd-core";

/**
 * A minimal stub rig: an ObserveEmitter with `read()` returning whatever we
 * recorded under `_emit()`. Lets us test the client-side iterator without an
 * HTTP server.
 */
function stubRig() {
  const buffer = new Map<string, string>();
  const node = new ObserveEmitter() as ObserveEmitter & {
    receive(uri: string, payload: string): Promise<void>;
    read(uris: string[]): Promise<[string, string | null][]>;
  };
  node.receive = async (uri: string, payload: string) => {
    buffer.set(uri, payload);
    // deno-lint-ignore no-explicit-any
    (node as any)._emit(uri, payload);
  };
  node.read = async (uris: string[]) =>
    uris.map((u) => [u, buffer.get(u) ?? null] as [string, string | null]);
  return node;
}

Deno.test("observeStreamFromRig surfaces deliveries posted after subscribe", async () => {
  const node = stubRig();
  const abort = new AbortController();
  const seen: { uri: string; payload: string | null }[] = [];

  const consumer = (async () => {
    for await (const d of observeStreamFromRig(node, "cc-chat://**", abort.signal)) {
      seen.push(d);
      if (seen.length >= 2) abort.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 10));
  await node.receive("cc-chat://stream/a/20260623-aaa", "hi");
  await node.receive("cc-chat://stream/b/20260623-bbb", "there");
  await consumer;

  assertEquals(seen.length, 2);
  assertEquals(seen[0].uri, "cc-chat://stream/a/20260623-aaa");
  assertEquals(seen[0].payload, "hi");
});
```

- [ ] **Step 7: Run the client test, confirm failure**

Run: `deno test tests/client_test.ts`
Expected: FAIL — `src/client.ts` does not exist.

- [ ] **Step 8: Create `src/client.ts`**

```ts
/**
 * @module
 * Client-side cc-chat helpers. Wraps a b3nd-move HTTP client (or any
 * ProtocolInterfaceNode-shaped object — see `observeStreamFromRig`) and
 * exposes a uniform `{ send, read, status, observeStream }` interface for
 * UIs and CLI tools.
 *
 * The fallback chain implemented here is what makes cc-chat work over any
 * transport:
 *   1. `observe` — preferred. b3nd-move's HTTP wire serves a streamed
 *      NDJSON of URI batches; we yield each as the transport emits it.
 *   2. (in MCP contexts) `resources/subscribe` — same idea, different
 *      transport. Out of scope for this HTTP-client wrapper; agents use
 *      the b3nd plugin's MCP tools directly.
 *   3. Polling `read` — last resort, only when neither stream is
 *      available. Off by default; opt in with `pollMs`.
 *
 * No server-side observe variants. cc-chat-specific behavior — block-and-
 * collect, roster derivation — lives in client-only helpers (see
 * `roster.ts`).
 */
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import type { ProtocolInterfaceNode } from "@bandeira-tech/b3nd-core";

export interface CcChatClientOpts {
  /** Target rig base URL, e.g. http://127.0.0.1:7373 */
  url: string;
  /** URI root, e.g. `cc-chat://`. Default `cc-chat://`. */
  root?: string;
  /** Optional polling fallback interval in ms. If unset, no polling. */
  pollMs?: number;
}

export interface Delivery {
  uri: string;
  payload: string | null;
}

export interface CcChatClient {
  readonly url: string;
  readonly root: string;
  send(uri: string, payload: string): Promise<{ accepted: boolean; error?: string }>;
  read(uris: string[]): Promise<Delivery[]>;
  observeStream(pattern: string, signal: AbortSignal): AsyncIterable<Delivery>;
}

export function ccChatClient(opts: CcChatClientOpts): CcChatClient {
  const http = new HttpClient({ url: opts.url });
  const root = opts.root ?? "cc-chat://";
  return {
    url: opts.url,
    root,
    async send(uri, payload) {
      const [res] = await http.receive([[uri, new TextEncoder().encode(payload)]]);
      return { accepted: res.accepted, error: res.error };
    },
    async read(uris) {
      const outs = await http.read([...uris]);
      return outs.map(([uri, payload]) => ({
        uri,
        payload: typeof payload === "string" ? payload : (payload == null ? null : String(payload)),
      }));
    },
    observeStream(pattern, signal) {
      return observeStreamFromHttp(http, pattern, signal);
    },
  };
}

async function* observeStreamFromHttp(
  http: HttpClient,
  pattern: string,
  signal: AbortSignal,
): AsyncIterable<Delivery> {
  for await (const batch of http.observe([pattern], signal)) {
    if (batch.length === 0) continue;
    const reads = await http.read([...batch]);
    for (const [uri, payload] of reads) {
      const p = typeof payload === "string" ? payload : (payload == null ? null : String(payload));
      yield { uri, payload: p };
    }
  }
}

/**
 * In-process variant for tests and embedded usage. Drives any
 * ProtocolInterfaceNode-shaped object that supports `observe` + `read`.
 */
export async function* observeStreamFromRig(
  rig: ProtocolInterfaceNode,
  pattern: string,
  signal: AbortSignal,
): AsyncIterable<Delivery> {
  for await (const batch of rig.observe([pattern], signal)) {
    if (batch.length === 0) continue;
    const reads = await rig.read([...batch]);
    for (const [uri, payload] of reads) {
      const p = typeof payload === "string" ? payload : (payload == null ? null : String(payload));
      yield { uri, payload: p };
    }
  }
}
```

- [ ] **Step 9: Run client test, confirm it passes**

Run: `deno test tests/client_test.ts`
Expected: PASS.

- [ ] **Step 10: Delete the old observe-window files**

```bash
git -C /Users/m0/ws/b3nd-cc-chat rm src/observe-window.ts tests/observe_window_test.ts
```

- [ ] **Step 11: Update `src/tail.ts` to use the new client**

Replace `src/tail.ts` with:

```ts
/**
 * @module
 * tail() — async iterator over live cc-chat deliveries on a remote rig.
 * Thin wrapper over `ccChatClient.observeStream` so the CLI and tests
 * share one path. No transport-specific code here.
 */
import { ccChatClient } from "./client.ts";

export interface TailOptions {
  url: string;
  /** URI root, default `cc-chat://`. */
  root?: string;
  /** Subscription pattern, default `${root}**`. */
  pattern?: string;
  signal: AbortSignal;
}

export interface TailDelivery {
  uri: string;
  payload: string | null;
}

export async function* tail(opts: TailOptions): AsyncIterable<TailDelivery> {
  const client = ccChatClient({ url: opts.url, root: opts.root });
  const pattern = opts.pattern ?? `${client.root}**`;
  for await (const d of client.observeStream(pattern, opts.signal)) {
    yield d;
  }
}
```

- [ ] **Step 12: Run the full test suite**

Run: `deno task test`
Expected: PASS — protocol_test.ts (18) + roster_test.ts (2) + client_test.ts (1) + tail_test.ts (2). 23 tests total.

If `tail_test.ts` references the deleted server, fix it: replace any `startServer`/`createCcChatRig` usage with an inline stub rig like the one in `client_test.ts`. Show the diff before committing.

- [ ] **Step 13: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add -A
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Split observe-window into client.ts (fallback) + roster.ts (gradient)"
```

---

## Task 3: Parameterize the web UI on `(targetRemote, rootPath)`

**Files:**
- Modify: `web/index.html`, `web/app.js`

**Interfaces:**
- Consumes: nothing (the UI talks directly to a remote b3nd rig over HTTP wire — the `client.ts` library is for Deno/Node; the browser keeps its inlined version).
- Produces: a static HTML+JS bundle that, given `?url=…` and `?root=…` (or settings-panel values), connects to any b3nd rig and renders deliveries under the root.

- [ ] **Step 1: Add a settings panel to `web/index.html`**

After the `<header>` and before `<main>`, add:

```html
<section id="settings" class="settings hidden">
  <label>
    <span>target rig URL</span>
    <input id="cfg-url" type="url" placeholder="http://127.0.0.1:7373" autocomplete="off">
  </label>
  <label>
    <span>root path</span>
    <input id="cfg-root" type="text" placeholder="cc-chat://" autocomplete="off">
  </label>
  <button id="cfg-apply">apply</button>
  <button id="cfg-cancel" class="muted">cancel</button>
</section>
```

In the existing `<header>` block, add a gear button next to the status indicator:

```html
<button id="cfg-toggle" class="cfg-toggle" title="settings">⚙</button>
```

In the `<style>` block, add:

```css
.settings { padding:14px 20px; border-bottom:1px solid #1a1f1d; display:flex; gap:12px; align-items:end; flex-wrap:wrap; }
.settings.hidden { display:none; }
.settings label { display:flex; flex-direction:column; gap:4px; font-family:var(--mono); font-size:12px; color:var(--muted); }
.settings input { background:#0a0d0c; color:var(--ink); border:1px solid #1a1f1d; padding:6px 8px; font-family:var(--mono); font-size:13px; min-width:280px; }
.settings button { background:var(--accent); color:#000; border:0; padding:7px 14px; font-family:var(--mono); font-size:12px; cursor:pointer; }
.settings button.muted { background:transparent; color:var(--muted); border:1px solid #1a1f1d; }
.cfg-toggle { background:transparent; border:1px solid #1a1f1d; color:var(--muted); padding:4px 8px; font-size:14px; cursor:pointer; margin-left:8px; }
```

Remove the `<meta name="cc-chat-rig">` tag if it exists.

- [ ] **Step 2: Replace the URL/root resolution and settings logic in `web/app.js`**

Replace the top section (the `RIG_URL`, `PATTERN_ALL` constants and the surrounding IIFE setup) up to the `// ---- DOM ----` block with:

```js
(() => {
  const STORAGE_KEY = "cc-chat:config";

  function loadConfig() {
    const params = new URLSearchParams(window.location.search);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { saved = {}; }
    const url = params.get("url") || saved.url || "http://127.0.0.1:7373";
    const root = params.get("root") || saved.root || "cc-chat://";
    return { url, root };
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
  }

  const cfg = loadConfig();
  let targetRemote = cfg.url;
  let rootPath = cfg.root;
  const pattern = () => `${rootPath}**`;

  // Visual ageing windows.
  const AGE_FADE_MS = 60_000;
  const PRESENCE_MIN_OPACITY = 0.18;
  const PRESENCE_WINDOW_MS = 30_000;
```

Then change every existing `RIG_URL` reference to `targetRemote`, and every `PATTERN_ALL` reference to `pattern()`.

- [ ] **Step 3: Add settings panel handlers**

Right before the `observeForever();` call at the end of the IIFE, insert:

```js
  // ---- Settings panel ----
  const cfgUrlEl = document.getElementById("cfg-url");
  const cfgRootEl = document.getElementById("cfg-root");
  const cfgToggleEl = document.getElementById("cfg-toggle");
  const cfgPanelEl = document.getElementById("settings");
  const cfgApplyEl = document.getElementById("cfg-apply");
  const cfgCancelEl = document.getElementById("cfg-cancel");

  function openPanel() {
    cfgUrlEl.value = targetRemote;
    cfgRootEl.value = rootPath;
    cfgPanelEl.classList.remove("hidden");
  }
  function closePanel() { cfgPanelEl.classList.add("hidden"); }

  cfgToggleEl.addEventListener("click", () => {
    cfgPanelEl.classList.contains("hidden") ? openPanel() : closePanel();
  });
  cfgCancelEl.addEventListener("click", closePanel);
  cfgApplyEl.addEventListener("click", () => {
    const newUrl = cfgUrlEl.value.trim();
    const newRoot = cfgRootEl.value.trim() || "cc-chat://";
    if (!newUrl) return;
    targetRemote = newUrl;
    rootPath = newRoot;
    saveConfig({ url: targetRemote, root: rootPath });
    closePanel();
    // Reload to restart the observe loop cleanly against the new target.
    const u = new URL(window.location.href);
    u.searchParams.set("url", targetRemote);
    u.searchParams.set("root", rootPath);
    window.location.assign(u.toString());
  });
```

- [ ] **Step 4: Update the URI parser to use `rootPath`**

The render function has a hardcoded `cc-chat://` regex. Replace:

```js
const m = /^cc-chat:\/\/(stream|presence)\/([a-z0-9][a-z0-9-]{0,31})\//.exec(uri);
```

with:

```js
const escaped = rootPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const m = new RegExp(`^${escaped}(stream|presence)\\/([a-z0-9][a-z0-9-]{0,31})\\/`).exec(uri);
```

(Keep this as a function-scoped regex constructed once per render call — fine for the throughput we expect.)

- [ ] **Step 5: Smoke-test in the browser**

Without a running rig, this is best done after Task 5/6 (when the user runs through the bootstrap dance). For now:

Run: `deno run --allow-net --allow-read --quiet -e 'Deno.serve({port:8123},(req)=>{const url=new URL(req.url);const p=url.pathname==="/"?"/index.html":url.pathname;return new Response(Deno.readFileSync("/Users/m0/ws/b3nd-cc-chat/web"+p),{headers:{"content-type":p.endsWith(".js")?"application/javascript":"text/html"}});});' &`

Then: `open "http://127.0.0.1:8123/?url=http://127.0.0.1:7373&root=cc-chat://"`

Expected: the page loads, the gear icon appears in the header, clicking it reveals the settings panel pre-filled with the URL and root, "connecting…" appears in the status indicator (it will fail because no rig is running — that's fine for this smoke step). Kill the background server.

- [ ] **Step 6: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add -A
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Web UI: parameterize on (targetRemote, rootPath) via URL params + settings panel"
```

---

## Task 4: Update scripts to take `--url` and `--root`

**Files:**
- Modify: `scripts/say.ts`, `scripts/tail.ts`

**Interfaces:**
- Consumes: `src/protocol.ts` (URI minters — see Task 6 for the scheme generalization), `src/client.ts` (`ccChatClient`).
- Produces: CLI surface — `deno task say [--url …] [--root cc-chat://] [--presence] <name> <text…>` and `deno task tail [--url …] [--root cc-chat://] [--pattern …] [--json]`.

- [ ] **Step 1: Update `scripts/say.ts` to accept `--root`**

After the `--url` parse line, add:

```ts
const root = arg("--root", argv) ?? "cc-chat://";
const rootI = argv.indexOf("--root");
if (rootI >= 0) argv.splice(rootI, 2);
```

Replace the mint calls with the root-aware versions (added in Task 6):

```ts
import { mintPresenceUri, mintStreamUri } from "../src/protocol.ts";
// …
const uri = presence ? mintPresenceUri(name, { root }) : mintStreamUri(name, { root });
```

(Note: until Task 6 lands, `mintPresenceUri`/`mintStreamUri` ignore the `{ root }` arg. The plan order ensures the script still works.)

- [ ] **Step 2: Update `scripts/tail.ts` to accept `--root`**

After `--url` parse, add:

```ts
const root = arg("--root", argv) ?? "cc-chat://";
```

Change the pattern default to use `root`:

```ts
const pattern = arg("--pattern", argv) ?? `${root}**`;
```

Pass `root` to `tail({ url, root, pattern, signal: abort.signal })`.

- [ ] **Step 3: Run the test suite to make sure tail still works**

Run: `deno task test`
Expected: PASS (no script tests, but tail.ts is imported by tail_test.ts).

- [ ] **Step 4: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add scripts/say.ts scripts/tail.ts
git -C /Users/m0/ws/b3nd-cc-chat commit -m "scripts: accept --root so CLI works under any cc-chat URI root"
```

---

## Task 5: Drop the bundled MCP server from the plugin

**Files:**
- Delete: `plugin/.claude-plugin/mcp-server/` (entire tree)
- Modify: `plugin/.claude-plugin/plugin.json`, `plugin/.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: the `bandeira-tech/b3nd` plugin (installed separately by the user) for `b3nd_receive` / `b3nd_read` / `b3nd_status` / `resources/subscribe`.
- Produces: a slimmer cc-chat plugin manifest with no MCP server.

- [ ] **Step 1: Delete the bundled MCP tree**

```bash
git -C /Users/m0/ws/b3nd-cc-chat rm -r plugin/.claude-plugin/mcp-server
```

Expected: the directory and its `mod.ts` are removed.

- [ ] **Step 2: Update `plugin/.claude-plugin/plugin.json`**

Read the current file first:

```bash
cat /Users/m0/ws/b3nd-cc-chat/plugin/.claude-plugin/plugin.json
```

Then remove the `mcpServers` block entirely. Replace the file with:

```json
{
  "name": "cc-chat",
  "version": "0.1.0",
  "description": "Present-only chat over b3nd. Skills + commands that teach agents the cc-chat:// convention; brings no rig — runs on the user's b3nd rig via the bandeira-tech/b3nd plugin.",
  "author": { "name": "Bandeira Tech" },
  "homepage": "https://github.com/bandeira-tech/b3nd-cc-chat",
  "license": "MIT",
  "keywords": ["b3nd", "chat", "present", "convention"]
}
```

(Adapt fields if the current file has values worth preserving.)

- [ ] **Step 3: Update `plugin/.claude-plugin/marketplace.json` to drop MCP entries**

If it lists the MCP server, remove that block. Show the diff before committing.

- [ ] **Step 4: Verify the plugin tree**

Run: `find /Users/m0/ws/b3nd-cc-chat/plugin -type f -not -path '*/.git/*'`

Expected: shows only `plugin.json`, `marketplace.json`, `skills/cc-chat/SKILL.md`, and `commands/{join,say,observe,who}.md`. No `mcp-server/`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add -A
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Plugin: drop bundled MCP server; cc-chat depends on bandeira-tech/b3nd"
```

---

## Task 6: Make `root` a required argument in the protocol library

**Files:**
- Modify: `src/protocol.ts`
- Modify: `tests/protocol_test.ts` — update existing tests to pass a root explicitly; add new tests for misuse.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mintStreamUri(root: string, name: string) → string`. Throws if `root` is missing, empty, or doesn't end with `/`.
  - `mintPresenceUri(root: string, name: string) → string`. Same rules.
  - `parseUri(root: string, uri: string) → { channel: "stream"|"presence"; name: string; seq: string } | null`. Returns null for URIs not under the given root, or whose tail doesn't match `(stream|presence)/<name>/<seq>`.

Note: the library has **no default root**. `cc-chat://` is a convention suggested by the bootstrap skill and the UI placeholder, not a library default. Callers (UI, scripts, plugin commands) carry their own default suggestion when convenient.

- [ ] **Step 1: Read the current protocol.ts**

```bash
cat /Users/m0/ws/b3nd-cc-chat/src/protocol.ts
```

Note current signatures (minters likely take only `name`; the parser likely uses a hardcoded `cc-chat://` regex). Both must change.

- [ ] **Step 2: Write failing tests**

Update `tests/protocol_test.ts` so existing tests pass a root explicitly. For each existing call like `mintStreamUri("alice")`, change to `mintStreamUri("cc-chat://", "alice")`. For each `parseUri("cc-chat://...")`, change to `parseUri("cc-chat://", "cc-chat://...")`.

Append:

```ts
import { mintPresenceUri, mintStreamUri, parseUri } from "../src/protocol.ts";

Deno.test("mintStreamUri runs under any operator-chosen root", () => {
  const a = mintStreamUri("cc-chat://", "alice");
  const b = mintStreamUri("chat://team-a/", "alice");
  const c = mintStreamUri("workspace://abcd/", "alice");
  if (!a.startsWith("cc-chat://stream/alice/")) throw new Error(a);
  if (!b.startsWith("chat://team-a/stream/alice/")) throw new Error(b);
  if (!c.startsWith("workspace://abcd/stream/alice/")) throw new Error(c);
});

Deno.test("parseUri returns null for URIs outside the configured root", () => {
  const r = parseUri("chat://team-a/", "cc-chat://stream/alice/20260623120000-abcdef");
  if (r !== null) throw new Error("expected null for wrong-root uri");
});

Deno.test("parseUri returns channel/name/seq for matches", () => {
  const r = parseUri("workspace://abcd/", "workspace://abcd/stream/alice/20260623120000-abcdef");
  if (!r || r.channel !== "stream" || r.name !== "alice") {
    throw new Error(`bad parse: ${JSON.stringify(r)}`);
  }
});

Deno.test("mintStreamUri throws when root is missing or malformed", () => {
  let threw = 0;
  try { mintStreamUri("", "alice"); } catch { threw++; }
  try { mintStreamUri("cc-chat", "alice"); } catch { threw++; }      // no separator
  try { mintStreamUri("cc-chat://no-trailing-slash", "alice"); } catch { threw++; }
  if (threw !== 3) throw new Error(`expected 3 throws, got ${threw}`);
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `deno test tests/protocol_test.ts`
Expected: FAIL — minters don't accept a root argument; the throw tests fail.

- [ ] **Step 4: Rewrite `src/protocol.ts` around a required root**

The structure is:

```ts
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SEQ_RE = /^[0-9]{14}-[a-z0-9]{6}$/;

function checkRoot(root: string): string {
  if (!root) throw new Error("root is required");
  if (!root.endsWith("/")) throw new Error(`root must end with '/', got: ${root}`);
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(root)) {
    throw new Error(`root must be a valid URI prefix (e.g. 'cc-chat://'): ${root}`);
  }
  return root;
}

function mintSeq(): string {
  const d = new Date();
  const ts = `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}` +
             `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const nonce = crypto.getRandomValues(new Uint8Array(6))
    .reduce((s, b) => s + "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36], "");
  return `${ts}-${nonce}`;
}
const pad = (n: number) => String(n).padStart(2, "0");

function checkName(name: string): string {
  if (!NAME.test(name)) throw new Error(`invalid cc-chat name: ${name}`);
  return name;
}

export function mintStreamUri(root: string, name: string): string {
  return `${checkRoot(root)}stream/${checkName(name)}/${mintSeq()}`;
}

export function mintPresenceUri(root: string, name: string): string {
  return `${checkRoot(root)}presence/${checkName(name)}/${mintSeq()}`;
}

export interface ParsedUri {
  channel: "stream" | "presence";
  name: string;
  seq: string;
}

export function parseUri(root: string, uri: string): ParsedUri | null {
  checkRoot(root);
  if (!uri.startsWith(root)) return null;
  const rest = uri.slice(root.length);
  const m = /^(stream|presence)\/([a-z0-9][a-z0-9-]{0,31})\/([0-9]{14}-[a-z0-9]{6})$/.exec(rest);
  if (!m) return null;
  return { channel: m[1] as "stream" | "presence", name: m[2], seq: m[3] };
}
```

(Preserve any extra exports the current file has — e.g. helpers used by `tail.ts` — by porting them to the new signatures.)

- [ ] **Step 5: Update call sites that passed a default**

```bash
grep -rn "mintStreamUri\|mintPresenceUri\|parseUri" /Users/m0/ws/b3nd-cc-chat/src /Users/m0/ws/b3nd-cc-chat/scripts /Users/m0/ws/b3nd-cc-chat/tests
```

Update each site to pass an explicit root. Per-file expectations:

- `scripts/say.ts` → pass the `root` parsed from `--root`.
- `scripts/tail.ts` → pass `root` to wherever it parses URIs for display.
- `src/tail.ts` → no parse calls; only the pattern, already root-aware.

- [ ] **Step 6: Run the full suite**

Run: `deno task test`
Expected: PASS. Tests are 18 protocol (updated) + 4 new protocol + roster (updated, see Task 2 step 4 note) + client + tail.

- [ ] **Step 7: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add src/protocol.ts tests/protocol_test.ts scripts/ src/
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Protocol: root is a required argument — operator chooses the mount"
```

---

## Task 7: Rewrite the cc-chat skill with the bootstrap dance

**Files:**
- Modify: `plugin/skills/cc-chat/SKILL.md`
- Create: `docs/bootstrap.md`
- Create: `docs/contract.md`

**Interfaces:**
- Consumes: standard `b3nd_*` MCP tools from the `bandeira-tech/b3nd` plugin (the user installs it separately).
- Produces: a skill that, when an agent says "get me in the chat," knows how to (a) find a target rig, or (b) propose the three setup paths.

- [ ] **Step 1: Write `docs/contract.md`**

Create `/Users/m0/ws/b3nd-cc-chat/docs/contract.md`:

```markdown
# The cc-chat convention

cc-chat is not a server. It is a convention agreed between **senders** and
**observers** that share a **target rig** and a **root path**.

## Root is operator-supplied

The **root path** is whatever URI prefix the operator mounts cc-chat at on
their rig. cc-chat itself has no scheme of its own. The same app code
runs unchanged under any of:

```
cc-chat://
chat://team-a/
workspace://abcd/
https://example.com/rooms/x/
```

`cc-chat://` is a *suggested starting root* that the bootstrap skill and
the UI placeholder offer. It is not part of the protocol. Operators pick
the root that fits their namespace.

## URI grammar (relative shape under the root)

Under the chosen root, two URI shapes are commitments:

```
<root>stream/<name>/<seq>      payload: utf-8 message text
<root>presence/<name>/<seq>    payload: "join" or "leave"
```

- `<name>` matches `[a-z0-9][a-z0-9-]{0,31}`.
- `<seq>` is `<YYYYMMDDhhmmss>-<6 base32 chars>` (UTC).

A sender that mints to spec is participating. A sender that mints garbage
is invisible — observers filter on `<root>**`, and malformed URIs miss
the pattern. There is no rejection; there is no noise.

## What the contract guarantees

- Anything posted under the root will route through the rig and be
  delivered to every observer whose subscription pattern matches.
- Payloads are plain UTF-8 text.
- The rig's persistence is the rig's business — the contract does not
  promise present-only-ness.

## Liveliness is self-report

There is no server-side presence. A name appears "warm" because it just
spoke or announced. The UI applies a warm → cold gradient on
`<root>**` traffic and decides who is "here" by recency, not by any
roster the rig maintains.

## Present-only vs persistent — a deployment property

Pointing cc-chat at a TTL'd in-memory rig (the original demo) gives the
present-only feel. Pointing it at `b3nd-save/fs` or `b3nd-save/postgres`
gives durable history. Both are valid cc-chat deployments. Operators
choose by configuring their rig.
```

- [ ] **Step 2: Write `docs/bootstrap.md`**

Create `/Users/m0/ws/b3nd-cc-chat/docs/bootstrap.md`:

````markdown
# Bootstrapping a cc-chat target

When an agent is asked to "get in the chat," it follows this flow. The
goal is to land on two values: a **target rig URL** and a **root path**.
Open-ended prompts are avoided — after each diagnosis step, the agent
uses `AskUserQuestion` with a structured multi-choice so the user picks,
not paraphrases.

## 1. Diagnose: is a rig already reachable?

In order:

1. **Is `b3nd_status` callable in this session?** If yes, another plugin
   (typically `bandeira-tech/b3nd`) has already wired the MCP to the
   user's rig — use it without asking. Skip to "Diagnose: what does it
   serve?"
2. **Probe localhost.** Try `GET http://127.0.0.1:7373/api/v1/status`.
   If 200, propose that URL via `AskUserQuestion`. (Multi-choice: "Yes,
   use this rig" / "No, point me elsewhere" / "No, set me up fresh".)
3. **Ask via `AskUserQuestion`** when neither: present three options —
   `[Install the b3nd plugin, Point me at an existing rig URL,
   Hand-roll a local rig]`.

## 2. Diagnose: what does the rig serve?

Call `b3nd_status`. Read `result.resources` — a structured advertisement:

```
{
  read:    ["immutable://open/", "mutable://open/", "entity://..."],
  observe: ["immutable://open/", "mutable://open/"],
  receive: ["immutable://open/", "mutable://open/"]
}
```

cc-chat needs **both `receive` and `observe`** under the same prefix — a
chat must be writable and live-observable. Intersect the two lists.

If `result.resources` is absent or empty, the rig is using a b3nd-core
older than the version that ships `resources` (Task 0 of this plan).
Treat as "no advertised mount" and proceed to step 4.

## 3. Offer mount choices via `AskUserQuestion`

Filter the intersection for well-known open mounts in this preference
order: `immutable://open/` first (append-only — best for chat), then
`mutable://open/`. Present whatever was found as a multi-choice:

```
AskUserQuestion {
  questions: [{
    question: "Where would you like to mount cc-chat?",
    multiSelect: false,
    options: [
      { label: "immutable://open/cc-chat/",
        description: "Append-only public mount. Recommended — old messages can't be rewritten." },
      { label: "mutable://open/cc-chat/",
        description: "Public mount. Anyone can post, anyone can overwrite or delete." },
      { label: "Pick a different namespace",
        description: "I'll ask for the root path." },
    ]
  }]
}
```

If only one well-known mount is on offer, still present a 2-option
question (chosen mount + "pick something else"). If neither is on offer,
skip directly to step 4.

The root the operator ends up choosing becomes the cc-chat session
root for the rest of the conversation.

## 4. Hand-roll (only when nothing reachable)

If steps 1–3 produced no rig, propose hand-rolling via `AskUserQuestion`:

```
options: [
  { label: "Filesystem (b3nd-save/fs)",
    description: "Persistent. Files on disk. I'll ask where." },
  { label: "Memory (b3nd-save/memory)",
    description: "Ephemeral. Vanishes when the process exits. Closest to present-only." },
  { label: "SQLite, Postgres, S3, IPFS, IndexedDB, LocalStorage…",
    description: "Pick another backend; I'll ask for the connection details." },
]
```

In every hand-roll path: **default the URI root to `immutable://open/cc-chat/`**
unless the user already chose one earlier.

### Hand-roll branch: filesystem

1. Ask via `AskUserQuestion` for the fs root: `["~/cc-chat-data",
   "./.cc-chat-data", "Pick a custom path"]`.
2. **Preview the on-disk layout before scaffolding.** With URI root
   `immutable://open/cc-chat/` and fs root `~/cc-chat-data`, sending
   `immutable://open/cc-chat/stream/alice/20260624120014-x9q2mp` (text
   `"hello"`) lands as:

   ```
   ~/cc-chat-data/immutable_open/cc-chat/stream/alice/20260624120014-x9q2mp.bin
   ← contains "hello"
   ```

   And the matching presence URI lands as:

   ```
   ~/cc-chat-data/immutable_open/cc-chat/presence/alice/20260624120005-abc123.bin
   ← contains "join"
   ```

   (`b3nd-save/fs` maps `proto://host/path` to `proto_host/path.bin`.
   Different URI root → adapt: `mutable://open/cc-chat/` maps under
   `mutable_open/cc-chat/`.)
3. **Confirm via `AskUserQuestion`**: `["Looks good, scaffold it",
   "Change the URI root", "Change the fs root", "Cancel"]`.
4. Scaffold a tiny `bnd` rig file at `~/.bnd/rig.ts` (or local
   `./b3nd.rig.ts`) that mounts an `FsStore(mountPrefix: "immutable://open/cc-chat/")`
   pointing at the agreed fs root. Show the snippet first.
5. Start: `bnd node --http :7373` (or `--mcp` for in-session agent access).

### Hand-roll branch: memory / other backend

Same shape — preview the storage grain (a Map row, a SQL row, an S3
object key) before scaffolding, then confirm via `AskUserQuestion`.

## Notes

- **Never install or scaffold without `AskUserQuestion` confirmation.**
  The diagnose-then-pick pattern is required throughout.
- **The cc-chat plugin contributes no rig.** It is the convention layer
  on top of whatever the user chooses here.
- **Default URI root for hand-rolled rigs is `immutable://open/cc-chat/`.**
  This makes new cc-chat deployments congruent with the b3nd public-mount
  convention, and append-only is closer to "present-only" than mutable.
````

- [ ] **Step 3: Rewrite `plugin/skills/cc-chat/SKILL.md`**

Replace its contents with:

````markdown
---
name: cc-chat
description: Use when the user asks you to "get in the chat", join a chat room, say something to other agents, observe the chat, listen for a window, or report what is happening in the chat. Teaches the cc-chat convention — a URI shape carried by any b3nd rig. cc-chat ships no server; if no target rig is configured, guide the user through the bootstrap dance (install the bandeira-tech/b3nd plugin, hand-roll a local FS rig, or pick another backend). Uses the b3nd plugin's MCP (b3nd_receive, b3nd_read, b3nd_status, resources/subscribe).
---

# cc-chat — a convention over b3nd

cc-chat is a contract: a *relative* URI shape (`stream/<name>/<seq>` and
`presence/<name>/<seq>`) mounted under a root the operator chooses, on a
rig the user controls. The cc-chat plugin contributes **no rig, no
custom MCP tools, and no URI scheme of its own** — you do everything
through the standard b3nd verbs exposed by the `bandeira-tech/b3nd`
plugin's MCP server, and the root path is whatever the operator picked.

## When to use

- "Get in the chat" / "join the chat" — pick a name, send a presence
  event, then subscribe via `resources/subscribe`.
- "Say X" / "tell <name> Y" — send one message.
- "Observe for N seconds" / "watch for {topic}" — subscribe via
  `resources/subscribe` and let the subscription deliver notifications;
  fetch payloads with `b3nd_read` as URIs arrive. If `resources/subscribe`
  is unavailable in the current MCP context, fall back to calling
  `b3nd_observe` (b3nd-core's streaming verb if the plugin exposes it),
  and as a last resort, poll `b3nd_read` against known URIs.
- "Who's here?" — observe for a short window, derive the roster
  client-side (sender names from the URIs you received).

## Before doing anything: diagnose then pick

There is no cc-chat without a target rig. Run the bootstrap dance from
`docs/bootstrap.md`. The short version:

1. **Is `b3nd_status` callable?** If yes (another plugin already wired
   the MCP), adopt that rig. Don't ask.
2. **Call `b3nd_status` and inspect `result.resources`.** Look for URI
   prefixes that appear in both `receive` and `observe` — that's where a
   chat can live. Prefer `immutable://open/` (append-only), then
   `mutable://open/`.
3. **Present choices via `AskUserQuestion`**, never open-ended prompts.
   The dance always reduces to a structured multi-choice:
   - "Which mount?" — when the rig advertises options.
   - "Install b3nd plugin / use my rig / hand-roll?" — when no rig is up.
   - "Which backend?" — when hand-rolling.
   - "Confirm this fs root + URI layout?" — before scaffolding writes.
4. **Default URI root when hand-rolling: `immutable://open/cc-chat/`.**
   Suggest this; let the user override via the same `AskUserQuestion`.

Never install or scaffold without an explicit `AskUserQuestion` answer.

## URI shape

```
<root>stream/<name>/<seq>      payload: utf-8 message text
<root>presence/<name>/<seq>    payload: "join" or "leave"
```

**Root is operator-chosen.** It is whatever URI prefix the user mounted
cc-chat at — `cc-chat://`, `chat://team-a/`, `workspace://abcd/`,
`https://example.com/rooms/x/`, anything well-formed that ends with `/`.
Ask the user for it on first use; suggest `cc-chat://` only as a starting
default if they have no preference. Save it for the rest of the session.

- `<name>` — `[a-z0-9][a-z0-9-]{0,31}`. Lowercase, no spaces, hyphens ok.
- `<seq>` — `<ts>-<nonce>` where `<ts>` is `YYYYMMDDhhmmss` UTC and
  `<nonce>` is six chars from `[a-z0-9]`. Mint fresh for every delivery.

A malformed URI is **invisible**, not noise: observers subscribe on
`<root>**` and the bad URI doesn't match the pattern.

## Joining

```
1. Pick a name.
2. Mint seq.
3. b3nd_receive: { messages: [[ "<root>presence/<name>/<seq>", "join" ]] }
4. resources/subscribe: { uri: "<root>**" }
```

## Saying

```
b3nd_receive: { messages: [[ "<root>stream/<name>/<seq>", "your text" ]] }
```

## Observing — use resources/subscribe

The MCP spec supports holding subscriptions across tool calls. While
the subscription is live, the server sends `notifications/resources/updated`
for each matching URI; fetch payloads with `b3nd_read`.

```
resources/subscribe { uri: "<root>**" }
# wait for the requested observation window or until the user redirects
# for each notification: b3nd_read([uri])
resources/unsubscribe { uri: "<root>**" }
```

If `resources/subscribe` is genuinely unavailable in the current
session, fall back: try `b3nd_observe`; as a last resort poll `b3nd_read`
on URIs you expect. Do not invent a server-side block-and-collect tool.

## "Who's here?"

Run an observation window (typically 5–15s), parse the unique
`<name>` portion out of each URI you saw, return the sorted set.
A name that posted a `<root>stream/...` URI is "speaking"; one that
posted `<root>presence/...` is "present." This is pure client-side
derivation — see `src/roster.ts` in this repo for the reference impl.

## Quick reference

| Verb     | Tool                       | URI                                | Payload      |
|----------|----------------------------|------------------------------------|--------------|
| join     | `b3nd_receive`             | `<root>presence/<me>/<seq>`        | `"join"`     |
| say      | `b3nd_receive`             | `<root>stream/<me>/<seq>`          | message text |
| observe  | `resources/subscribe`      | `<root>**`                         | —            |
| fetch    | `b3nd_read`                | urls observed via subscription     | —            |
| leave    | `b3nd_receive`             | `<root>presence/<me>/<seq>`        | `"leave"`    |

## Connecting to a remote rig

The b3nd plugin's MCP launches `bnd node --mcp` against the user's
active target (configured via `/b3nd:targets`). To point at a remote
rig, switch targets there — cc-chat does not store its own URL.
````

- [ ] **Step 4: Sanity-check the skill description triggers**

Run: `grep -n "description:" /Users/m0/ws/b3nd-cc-chat/plugin/skills/cc-chat/SKILL.md | head`

Expected: a description that mentions "get in the chat", "join", "say", "observe", "tell", and the bootstrap dance.

- [ ] **Step 5: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add -A
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Skill: rewrite cc-chat as convention + bootstrap dance (no bundled rig)"
```

---

## Task 8: Rewrite the slash commands

**Files:**
- Modify: `plugin/commands/join.md`, `say.md`, `observe.md`, `who.md`

**Interfaces:**
- Consumes: b3nd plugin's MCP tools (`b3nd_receive`, `b3nd_read`, `b3nd_status`, `resources/subscribe`).
- Produces: four slash commands that compose the cc-chat URI shapes on top of those standard tools.

- [ ] **Step 1: Rewrite `plugin/commands/join.md`**

```markdown
---
description: Join the cc-chat. Pick a name and announce presence.
argument-hint: <name>
---

You are joining the cc-chat under the user's currently-configured root.

**Pre-flight:** Verify the b3nd MCP is connected (`b3nd_status` is callable).
If not, follow the cc-chat skill's bootstrap dance before proceeding.

**Root:** If you don't have one in this session, derive it via the
bootstrap dance — `b3nd_status` → inspect `resources.{receive,observe}`
→ `AskUserQuestion` with the discovered options. Default suggestion is
`immutable://open/cc-chat/` (append-only public mount). Save the chosen
root for the rest of the session.

**Name:** $ARGUMENTS — if empty, ask the user for a short name matching
`[a-z0-9][a-z0-9-]{0,31}`.

Then:

1. Mint a seq: `ts = current UTC YYYYMMDDhhmmss`, `nonce = 6 random
   base32 chars`.
2. Call `b3nd_receive` with `[[ "<root>presence/<name>/<seq>", "join" ]]`.
3. Open a subscription with `resources/subscribe { uri: "<root>**" }`.
4. Tell the user: "Joined as `<name>`. Use `/cc-chat:say <text>` to
   speak, `/cc-chat:observe <seconds>` to watch a window, `/cc-chat:who`
   to see who else is around."

Remember the name and root for the rest of the session. Subsequent
`/cc-chat:say`, `/cc-chat:observe`, and `/cc-chat:who` use them.
```

- [ ] **Step 2: Rewrite `plugin/commands/say.md`**

```markdown
---
description: Say something in the cc-chat.
argument-hint: <text>
---

Send one message under your session name on the active root.

1. If you don't have a name yet, run `/cc-chat:join <name>` first.
2. Mint a fresh seq.
3. `b3nd_receive { messages: [[ "<root>stream/<name>/<seq>", "$ARGUMENTS" ]] }`.
4. Confirm to the user the URI you sent.
```

- [ ] **Step 3: Rewrite `plugin/commands/observe.md`**

```markdown
---
description: Observe the cc-chat for N seconds and report what you saw.
argument-hint: <seconds>
---

**Window:** $ARGUMENTS seconds (default 30, max 300).

Approach:

1. If a `resources/subscribe` subscription is already open from
   `/cc-chat:join`, use it. Otherwise open one: `resources/subscribe
   { uri: "<root>**" }`.
2. Collect every URI you receive via `notifications/resources/updated`
   for the window.
3. Fetch payloads in a single `b3nd_read` call at the end of the window
   (or as URIs arrive — your call).
4. Unsubscribe if you opened it just for this call.
5. Report to the user: per-line `<time> <name>: <text>` for stream
   URIs, `<time> <name> joined/left` for presence URIs. Note any
   payloads that came back null (rig buffer evicted before fetch — a
   present-only rig is allowed to drop).

If the MCP context cannot hold a subscription across the wait, fall
back to `b3nd_observe` (b3nd-core streaming verb) if exposed, or poll
`b3nd_read` with a known prefix. Do not invent a server-side
block-and-collect.
```

- [ ] **Step 4: Rewrite `plugin/commands/who.md`**

```markdown
---
description: Who is in the cc-chat right now? Listen briefly and report.
argument-hint: [seconds]
---

**Window:** $ARGUMENTS seconds (default 10, max 60).

1. Observe `<root>**` for the window (subscribe or fall back, same as
   `/cc-chat:observe`).
2. From the URIs you saw, parse `<name>` out of each
   `<root>(stream|presence)/<name>/<seq>` URI.
3. Report two sorted lists:
   - **speaking** — names that posted under `<root>stream/...`.
   - **present** — names that posted under `<root>presence/...`.
4. If both lists are empty, say "no one in the last $ARGUMENTS s".
```

- [ ] **Step 5: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add plugin/commands/
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Commands: rewrite over standard b3nd MCP tools + subscribe fallback"
```

---

## Task 9: Update README + docs to reflect the convention model

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/usage.md`, `docs/cookbook.md`, `docs/design.md`, `docs/demo.md`

**Interfaces:** none.

- [ ] **Step 1: Rewrite `README.md`**

Replace its body with a description matching the new model. Key sections:

- **What you do.** Same three audience tracks (agent / browser / terminal),
  but each opens with "point at your rig."
- **Shape.** Replace the "one rig in this repo" ASCII with a diagram
  showing user-controlled rig + cc-chat library + UI/CLI/plugin clients.
- **Quick start.** Replace `deno task serve` with:

  ```sh
  # 1. Have a b3nd rig running. Either:
  #    a. install the bandeira-tech/b3nd plugin and run /b3nd:install
  #    b. or hand-roll a quick one — see docs/bootstrap.md
  # 2. Point the cc-chat UI at it
  open "http://localhost:8000/?url=http://127.0.0.1:7373&root=cc-chat://"
  # 3. Or tail from the terminal
  deno task tail --url http://127.0.0.1:7373
  # 4. Install the cc-chat plugin for agent access
  /plugin marketplace add /Users/m0/ws/b3nd-cc-chat/plugin
  /plugin install cc-chat@cc-chat
  ```

- Drop all references to `deno task serve`, `cc_chat_observe`,
  `cc_chat_who`.

- [ ] **Step 2: Rewrite `docs/architecture.md`**

Replace its Mermaid diagram with the new shape (UI/CLI/agent →
b3nd-move HTTP/MCP wire → user's rig). The "how a say lands" walkthrough
should end at the user's rig, not at a `PresentChatNode`.

- [ ] **Step 3: Rewrite `docs/usage.md`**

Remove all server/rig setup commands. Show:

- Pointing the UI at any URL with `?url=` and `?root=`.
- Running `deno task tail --url … --root …`.
- Sending with `deno task say --url … --root … <name> <text>`.
- Using the slash commands once the b3nd plugin's MCP is connected.

- [ ] **Step 4: Rewrite `docs/cookbook.md`**

Update each recipe to point at the user's rig (URL configurable). Drop
any recipe that depended on a bundled `cc_chat_observe` / `cc_chat_who`
tool; replace with subscribe + roster-from-observed equivalents.

- [ ] **Step 5: Rewrite `docs/design.md`**

Drop file-by-file descriptions of `node.ts`, `rig.ts`, `serve.ts`. Add
`client.ts`, `roster.ts`. Note explicitly: "cc-chat contributes no rig."

- [ ] **Step 6: Update `docs/demo.md`**

Re-record (or annotate) the transcript so it makes clear which rig was
in use. If the original demo depended on `deno task serve`, replace it
with a transcript that uses `bnd node --http :7373` (or note that a
fresh demo will be captured in Task 10).

- [ ] **Step 7: Commit**

```bash
git -C /Users/m0/ws/b3nd-cc-chat add README.md docs/
git -C /Users/m0/ws/b3nd-cc-chat commit -m "Docs: rewrite for convention-only cc-chat"
```

---

## Task 10: End-to-end smoke test against a real `bnd` rig

**Files:** none modified. This task validates the work and produces a
short transcript for `docs/demo.md` if the user wants it.

**Interfaces:** none.

- [ ] **Step 1: Make sure `bnd` is installed and a target is configured**

Run: `command -v bnd && bnd status`

Expected: `bnd` resolves; `bnd status` reports a reachable rig.

If not, ask the user to run `/b3nd:install` and `/b3nd:targets` first.
Do not silently install.

- [ ] **Step 2: Start the rig over HTTP for the UI/CLI to connect**

Run (in a separate shell or background): `bnd node --http :7373`

Expected: rig listening on `:7373`. Confirm with `curl -fsS http://127.0.0.1:7373/api/v1/status`.

- [ ] **Step 3: Serve the static web UI**

Run: `cd /Users/m0/ws/b3nd-cc-chat && deno run --allow-net --allow-read --quiet -e 'Deno.serve({port:8123},(req)=>{const url=new URL(req.url);const p=url.pathname==="/"?"/index.html":url.pathname;return new Response(Deno.readFileSync("./web"+p),{headers:{"content-type":p.endsWith(".js")?"application/javascript":"text/html"}});});' &`

Then: `open "http://127.0.0.1:8123/?url=http://127.0.0.1:7373&root=cc-chat://"`

Expected: page loads, status indicator goes `live` within ~1s.

- [ ] **Step 4: Send a message from the CLI, see it land in the UI**

Run: `deno task say --url http://127.0.0.1:7373 claude "hello from cli"`

Expected: a green row appears in the UI within ~1s reading `hh:mm:ss claude hello from cli`. The "claude" name appears in the presence panel with `now`.

- [ ] **Step 5: Tail from the terminal, post from another shell**

Shell A: `deno task tail --url http://127.0.0.1:7373`
Shell B: `deno task say --url http://127.0.0.1:7373 writer "and back"`

Expected: shell A prints a colored `writer and back` line.

- [ ] **Step 6: Confirm UI settings panel cycles correctly**

In the browser: click the gear icon, change the URL to a deliberately
broken one (`http://127.0.0.1:9999`), click apply. Page reloads.
Expected: status indicator shows `connecting…` then `disconnected ·
reconnecting`. Click gear, change back to the working URL, apply.
Expected: live again.

- [ ] **Step 7: Cleanup**

Kill the static-UI background server and the `bnd node` process.

- [ ] **Step 8 (optional): Capture a fresh `docs/demo.md`**

If the user wants the demo transcript refreshed, capture the
`deno task tail` output and a screenshot of the UI and update
`docs/demo.md`. Commit with message: `Demo: refresh transcript on
convention model`.

---

## Self-review checklist

- **Spec coverage:**
  - "Get rid of custom server" → Tasks 1, 5.
  - "Standard b3nd-move interface, no custom server methods" → Tasks 1, 5, 8.
  - "Protocol semantics on the wire in b3nd" → Tasks 6, 7 (URI grammar).
  - "Only a root, client-side coordination" → Tasks 2, 6.
  - "Root is operator-supplied; the cc-chat library has no scheme of its own" →
    Tasks 6 (required-arg signature), 2 (`rosterFromObserved(root, …)`),
    3 (UI surfaces the field), 7 (contract + bootstrap + skill explain).
  - "Discovery via `StatusResult.resources` per verb; rig aggregates" →
    Task 0 (upstream: b3nd-core type + Rig aggregator + b3nd-save self-report
    + b3nd-move round-trip tests + cc-chat dep bump).
  - "Setup interactions via `AskUserQuestion` multi-choice, not open prompts" →
    Tasks 7 (bootstrap.md + SKILL.md), 8 (join command derives root via dance).
  - "Default URI root when hand-rolling: `immutable://open/cc-chat/`" →
    Tasks 7 (bootstrap), 8 (join command), 9 (README quick-start).
  - "Resource subscribe, fallback observe / poll" → Task 2 (client lib),
    Task 7 (skill guidance), Task 8 (observe/who commands).
  - "Web = fn(targetRemote, rootPath)" → Task 3.
  - "Liveliness self-report + warm/cold gradient" → Task 2 (`gradientStops`),
    Task 3 (UI uses it), Task 7 (skill explains).
  - "No target rig shipped; promote bandeira-tech/b3nd plugin" → Tasks 5, 7.
  - "Hand-roll over `b3nd-save/fs`: ask for fs root, show example files" →
    Task 7 (bootstrap.md path B).
  - "Coordination/validation in shared contract" → Task 7 (contract.md +
    skill).

- **Placeholder scan:** searched for "TBD", "TODO", "fill in", "appropriate
  error handling" — none present. Hand-rolled-over-fs example file paths
  use the documented `b3nd-save/fs` mapping (`proto_host/path.bin`).

- **Type consistency:** `ccChatClient`, `observeStreamFromHttp`,
  `observeStreamFromRig`, `Delivery`, `rosterFromObserved`,
  `gradientStops`, `mintStreamUri`, `mintPresenceUri`, `parseUri` are
  referenced consistently across Tasks 2, 3, 4, 6, 7.
