# Spec — recursive listing for b3nd `read` (`fn=find`)

**Status:** v1, agreed in `immutable://open/cc-chat/20260625093437-listing-spec/`
by representatives of `b3nd-core`, `b3nd-move`, `b3nd-save`, and `b3nd-cc-chat`.
**Scope:** how `b3nd-save` stores expose a recursive content listing through
the existing `read` surface; what callers can rely on; the change-list per
package.

This spec is *normative* for `b3nd-save` and the helpers it exports. It is
*advisory* for `b3nd-core` and `b3nd-move` — neither package needs to change
to support this capability (see §6), and the spec respects that.

---

## 1. Motivation

Today `fn=ls` returns **direct children only** under a prefix
(`b3nd-save/src/read.ts:163-185` — `*` and `?` are `/`-stopping), and there
is no `**` globstar in the read grammar. Any caller that owns a deep URI
tree — `cc-chat` being the working example — must fan out one shallow `ls`
per nesting level to enumerate the tree, paying N round trips where
one would do.

Concrete proof of the gap: `b3nd-cc-chat/web/app.js`'s `loadHistory` (the
pure-PIN history replay for the cc-chat web UI) issues
`participants × 6 non-mention types + participants × (participants − 1)
mention targets` `?fn=ls&format=uris` calls just to enumerate leaves, then
a second pass to read payloads — `N · (N + 5)` shallow calls for a room
of N participants, batched 50 per request, before a single payload lands.
`b3nd-cc-chat/plugin/commands/manage-coordination.md:160` already states
the protocol's aspiration — "*Read the full room via `b3nd_read` on
`<root><room>/**`*" — which today no wire honors.

The same shape is what `b3nd-builders` on **any** deep-tree consumer will
hit. This spec gives them a single primitive that backends agree on.

---

## 2. Decision summary

| Decision                          | Choice                                                     |
|-----------------------------------|------------------------------------------------------------|
| Name of the recursive verb        | **`fn=find`** (new, not a `recursive=true` flag on `fn=ls`) |
| Recursive wildcard                | **`**`** (globstar; matches across `/`), only under `fn=find` |
| Existing `*`, `?`                 | Unchanged — both stay `/`-stopping                         |
| `fn=ls` behavior with `**`        | **MUST reject** (fail loud, programmer error)              |
| Grammar parity with observe       | Yes — same `**` semantics as `b3nd-core/src/match-pattern` |
| Sort                              | New reserved `sortBy=leaf` (basename `localeCompare`)      |
| Pagination                        | Existing `cursor=&limit=` on `?fn=find`                    |
| Cursor wire shape                 | Trailing slot in `outputs-frame`; slot URI is a **re-issuable locator** |
| HTTP wire changes                 | **Zero** — params ride `?u=` opaquely                      |
| MCP wire changes                  | **Zero** — `fn=find` rides `tools/call b3nd_read`; `resources/list` stays capability-only |
| `b3nd-core` changes               | **Zero**                                                   |
| Rig polyfill of recursive ls      | **No** — rejected; `walkViaLs` is a caller-invoked helper from `b3nd-save` |
| Capability discovery              | `StatusResult.fns` — each store declares `"ls"` and `"find"` independently |
| Federation (one locator → many stores) | Out of scope                                          |
| Field-level filters (e.g. `type=msg`) | Out of scope; future `fn=query`                        |

---

## 3. Grammar (normative)

### 3.1 The verb

```
<uri>?fn=find[&pattern=<glob>][&format=<full|uris>][&sortBy=<uri|leaf|<field>>]
            [&sortOrder=<asc|desc>][&limit=<n>][&page=<n>|&cursor=<opaque>]
            [&fields=<csv>]
```

- `<uri>` is the prefix the recursive walk is anchored at. Trailing `/` is
  permitted; the URI is the routing identity and is matched against routes
  the same way `fn=ls` is matched today (`b3nd-save/src/url.ts:100-165`).
- `fn=find` is a **new** reserved value next to `read`, `ls`, `count`
  (`url.ts:22-26` doc-comment). The default `fn` for a trailing-slash URI
  remains `ls` — `find` is always explicit.
- Every `ls` parameter (`pattern`, `format`, `cursor`, `limit`, `page`,
  `sortBy`, `sortOrder`, `fields`) is valid on `find` with identical
  semantics. The return shape mirrors `ls`: `Output[]` for `format=full`
  (default), `string[]` for `format=uris`.

### 3.2 Glob grammar

Three wildcards in `pattern`. All others are escaped literals.

| Token | Means                                              | Crosses `/`? |
|-------|----------------------------------------------------|--------------|
| `?`   | exactly one non-`/` character                      | no           |
| `*`   | zero or more non-`/` characters                    | no           |
| `**`  | zero or more characters **including** `/`          | **yes**      |

- `**` is **only meaningful under `fn=find`**. Under `fn=ls`, encountering
  `**` in `pattern` MUST raise — same precedent as `b3nd-core/src/match-pattern/
  match-pattern.ts`, which already rejects malformed segments.
- The `**` semantics match the observe-subscription grammar `b3nd-core`
  already documents (`b3nd-core/src/types/types.ts:238-264`, example uses
  `mutable://market/**`). A builder can write `<root><room>/**` once and
  use the same string for both `find` and `observe`.
- Pattern is anchored on both ends, applied to the URI tail after the
  `<uri>` prefix (same as `matchesUriPattern` at `b3nd-save/src/read.ts:192-199`).
- `pattern=**` (or no `pattern`) means "every descendant." `pattern=foo/**/bar`
  means "any descendant whose tail starts with `foo/`, ends with `bar`,
  with arbitrary `/`-spanning middle."

### 3.3 Sort

`sortBy` accepts:

| Value        | Order                                                                 |
|--------------|-----------------------------------------------------------------------|
| `uri`        | Full URI `localeCompare` (existing default for `ls`/`find`)            |
| `leaf`       | Basename only — `uri.slice(uri.lastIndexOf("/") + 1)` then `localeCompare` |
| `<field>`    | Record field — existing dispatch-layer post-sort (`pushDownSortBy` opt-in) |

`sortBy=leaf` is the **minimum cross-backend sort primitive** needed by
deep-tree consumers like `cc-chat` (whose leaves are `<ts>-<slug>.{md,json}`
across multiple depths — a full-URI sort sorts by participant, not by ts).
It is store-agnostic: any backend that can collect URIs can sort by leaf in
the in-process post-sort path (`b3nd-save/src/read.ts:74-86`). Push-down
for `sortBy=leaf` is optional (`pushDownSortBy: true` covers it the same
way it covers other non-uri sorts today).

`sortOrder` (`asc`/`desc`) applies to all `sortBy` values, unchanged.

### 3.4 Pagination — cursor as trailing slot

Cursor pagination is delivered through the **existing `outputs-frame`** with
zero codec change.

When `fn=find` (or `fn=ls`) is called with `limit=<n>` AND the underlying
result was truncated, the implementation MUST append **one extra slot** to
the returned `Output[]`. The slot's shape:

- **URI** — a **re-issuable locator** of the form
  `<original-locator>?cursor=<opaque>` (with `limit`, `sortBy`, etc.
  preserved; only `cursor` is added or replaced). A caller can call
  `read([slot.uri])` verbatim to fetch the next page.
- **Payload** — `{ "next": "<opaque>" | null }` (JSON). `next` is the
  opaque cursor value (matching the URI's `cursor=` param); `null` only on
  the final page.

When the result is **not** truncated (full page returned but no more rows),
implementations MUST still append the trailing slot with `next: null` so
callers can distinguish "page-empty-because-end" from
"page-empty-because-page-skipped".

**Why re-issuable, not opaque sentinel:** composability. The locator
doctrine (`b3nd-core/src/types/types.ts:184-192`) is that locators are
opaque to the framework but the *caller* can pass them anywhere `read`
accepts a locator. A re-issuable cursor URI keeps the pagination loop a
pure rig call:

```ts
let next: string | null = `${prefix}?fn=find&pattern=**&limit=200`;
while (next) {
  const outs = await rig.read([next]);
  const cursorSlot = outs[outs.length - 1];
  const cursor = (cursorSlot[1] as { next: string | null }).next;
  next = cursor ? `${prefix}?fn=find&pattern=**&limit=200&cursor=${cursor}` : null;
  // ... handle outs.slice(0, -1)
}
```

If the slot URI were an opaque sentinel + a `next` field to reconstruct,
every caller would need grammar-aware glue to rebuild the next-page URL —
exactly the kind of glue this spec exists to delete.

### 3.5 Errors and unsupported asks

- A store that does not advertise `"find"` in `status().fns` MUST throw on
  `fn=find` — same path as `b3nd-save/src/dispatch.ts:307`'s "unknown fn"
  branch. **No silent fallback** — the caller gets a loud failure they can
  handle (or that surfaces in tests).
- A store that advertises `"find"` but receives `pattern` containing `**`
  MUST handle it (push down or post-filter). It MAY still error on grammar
  it does not understand (e.g. an unknown sortBy field on a non-`pushDownSortBy`
  store).
- A store MUST NOT silently downgrade `fn=find` to `fn=ls` (shallow-only).
  Either it does the recursion (push-down or in-process) or it throws.

---

## 4. Capability advertisement

`StatusResult.fns` (`b3nd-core/src/types/types.ts:64-74`) is the discovery
channel. Each store independently declares which fns it supports.

After this spec lands, a store's `status()` shape becomes:

```ts
{
  status: "healthy",
  fns: ["read", "ls", "find", "count"],   // existing + new "find"
  // ...
}
```

A store that has not yet implemented the change-list in §6 omits `"find"`.
Callers MAY check `status().fns` before issuing `fn=find` to fail
fast on unsupported targets. The contract:

- `"ls"` and `"find"` are **independent capability bits**. A store that
  supports only one is honest, not broken.
- Once a store advertises `"find"`, it MUST honor the full grammar in §3
  including `**` globstar and `sortBy=leaf`.
- The rig itself does NOT inspect `fns` (locator opacity — `b3nd-core/src/
  rig/rig.ts:683-724`). Discovery is the caller's affair.

---

## 5. Wire mapping

### 5.1 HTTP — zero changes

`POST /api/v1/read?u=<b64>` (`b3nd-move/src/http/read.ts:27-45`) is the
bearer. The url-list codec (`b3nd-move/src/codecs/url-list.ts`) is
grammar-blind: `<uri>?fn=find&pattern=**&...` rides as an opaque url just
like `<uri>?fn=ls&...` does today. The outputs-frame
(`b3nd-move/src/codecs/outputs-frame.ts`) carries the result unchanged; the
cursor slot is just one more `[uri, payload]` tuple.

**Response-size note (move).** The default `maxCount=1024` slots-per-frame
ceiling (`b3nd-move/src/codecs/outputs-frame.ts:48`) bounds a single
recursive read. `cursor=&limit=` pagination is the v1 answer — bounded
responses, no new endpoint, no NDJSON streaming. Streaming `read` is a
v1.x add when a real call site demands it.

### 5.2 MCP — zero changes

- `tools/call b3nd_read` (`b3nd-move/src/mcp/service.ts:142-155`) is the
  recursive-listing entry point. The url passed to it is
  `<root><room>/?fn=find&...` — same shape as the HTTP wire.
- `resources/list` (`b3nd-move/src/mcp/service.ts:185-199`) **stays
  shallow / capability-listing only**. It already returns `programs` from
  `rig.status` — not content. Recursive content listing does NOT belong
  there; doing so would break the existing capability-listing semantic.
- `resources/subscribe` (`b3nd-move/src/mcp/service.ts:201-238`) already
  takes opaque URI/pattern; `<root><room>/**` already works on the observe
  side iff the store understands it. Adopting `**` for `fn=find` makes the
  read and observe surfaces use the same grammar string.

If a downstream wants a `b3nd_find` sugar tool (a thin wrapper that
pre-applies `fn=find`), that is a move-side ergonomic question, not a
contract change. Out of scope for this spec.

---

## 6. Change-list per package

### 6.1 `b3nd-core` — zero changes

`b3nd-core` does not need to change. Three reasons (each cited):

- `b3nd-core/src/types/types.ts:213-236` — `read` is contractually opaque
  to the framework; locator grammar is the executing client's concern.
- `b3nd-core/src/rig/rig.ts:683-724` — `rig.read` dispatches each locator
  to the matching connection 1:1; no grammar parsing, no expansion. A
  locator that expands to many outputs is already the contract of `read()`
  — `N` outputs back from one URL.
- `b3nd-core/src/types/types.ts:64-74` — `StatusResult.fns` is the
  advisory capability bag; the framework neither populates nor interprets
  it. Save populates it with `"find"`; the framework stays oblivious.

The rig MUST NOT polyfill recursive listing for stores that advertise
only `"ls"`. A `walkViaLs` helper, if shipped, belongs in `b3nd-save`
(see §7) and is caller-invoked. Burying expansion in the rig would
inject grammar awareness and surprising cost behind an opaque locator —
both against the puritan-cores rule.

### 6.2 `b3nd-move` — zero changes

- HTTP `read` route, codecs, observe stream — none change.
- MCP `tools/call b3nd_read` — none change.
- MCP `resources/list` — explicitly **does not** change (stays shallow).

Move's contribution is the spec clarification of §3.4 (cursor as
trailing slot in outputs-frame): the convention is normative on the wire
but requires no codec or route work. Save populates the slot.

### 6.3 `b3nd-save` — all the real work

Three files in `src/` plus per-store hooks:

**`b3nd-save/src/url.ts`**
- Add `"find"` to the reserved-fn doc-comment at `:22-26`. The switch
  itself is in `dispatch.ts` — no parser change needed (the existing
  `parseUrl` already routes arbitrary `fn=<name>` values).

**`b3nd-save/src/read.ts`**
- Extend `patternToRegexBody` (`:177-185`) with an optional
  `{ globstar?: boolean }` arg. When `globstar: true`, `**` compiles to
  `.*`. `*` and `?` stay `[^/]*` / `[^/]` respectively.
- Extend `patternToSqlLike` (`:219-228`) with the same option. When
  `globstar: true`, `**` becomes `%`. Callers using `globstar: true` MUST
  omit the `NOT LIKE prefix||'%/%'` shallow-safety clause (`read.ts:208-213`).
- Add `sortBy=leaf` handling to `applyReadParams` (`:65-111`) — extract
  basename via `uri.slice(uri.lastIndexOf("/") + 1)`, `localeCompare`.
- Extend `validateReadParams` (`:38-51`) to accept `"leaf"` as a reserved
  `sortBy` value.
- Optional: a `matchesUriPatternRecursive` helper that wraps
  `matchesUriPattern` (`:192-199`) with `globstar: true`.

**`b3nd-save/src/dispatch.ts`**
- Add a `find` case to the switch at `:151`. Logic mirrors the `ls` branch
  (`:158-220`): pattern post-filter, cursor post-filter, sort, paginate.
  Composed with the `globstar: true` regex.
- Add `pushDownFind?: boolean` to `ReadHandlers`. Default `false` → save
  walks via the handler's `ls`-shaped output and applies pattern/cursor
  post-filter in JS.
- When `params.limit` is set AND the truncation dropped rows (or the page
  is exhausted), **append the trailing cursor slot** per §3.4. URI =
  re-issuable locator (`<original>?cursor=<opaque>`), payload =
  `{next: <opaque>|null}`. Save owns this; move stays grammar-blind.
- A store whose handler-table lacks a `find` entry continues to fall
  through `dispatch.ts:307`'s "unknown fn" throw — the existing behavior.

**Per-store hooks** (one-line for 7 of 10, executor extension for fs):

| Store              | Change                                                                 | File                                  |
|--------------------|------------------------------------------------------------------------|---------------------------------------|
| `memory`           | Drop `rest.includes("/")` check in `_walk` (`:248`); add `find` handler | `memory/store.ts`                     |
| `ipfs`             | Drop `tail.includes("/")` filter (`:295`); add `find` handler          | `ipfs/store.ts`                       |
| `localstorage`     | Drop shallow tail filter (`:290`); add `find` handler                  | `localstorage/store.ts`               |
| `indexeddb`        | Relax tail check in cursor walk; add `find` handler                    | `indexeddb/store.ts`                  |
| `s3`               | Drop `tail.includes("/")` filter (`:298`) — `listObjects` already walks deep; add `find` handler | `s3/store.ts`        |
| `mongo`            | Swap `[^/]+` for `.*` in regex body when called via `find` (`:351-353`); add `find` handler | `mongo/store.ts`  |
| `elasticsearch`    | Swap `[^/]+` for `.*` in Lucene regexp body (`:351-354`); add `find` handler | `elasticsearch/store.ts`        |
| `sqlite`           | Drop `NOT LIKE %/%` predicate when `fn=find` (`:377`); pass `globstar: true` to `patternToSqlLike` | `sqlite/store.ts` |
| `postgres`         | Same drop (`:395`); same `globstar: true` | `postgres/store.ts`                   |
| **`fs`**           | **Needs executor extension.** Add `walkFiles(dir): Promise<string[]>` (or `AsyncIterable<string>`) method to `FsExecutor` (`fs/mod.ts:16-28`). `find` handler calls `walkFiles` and applies the pattern/sort/pagination in-process. | `fs/store.ts`, `fs/mod.ts` |

After each store implements its `find` handler and adds `"find"` to its
`status().fns`, the capability is discoverable per §4. Stores that haven't
landed the change yet honestly advertise only `"ls"` and reject `fn=find`.

### 6.4 `b3nd-cc-chat` — caller migration

- `web/app.js` `loadHistory` (`:400-461`) collapses from
  `participants × types × ls` fan-out + N-batched payload reads to a
  single paginated `fn=find` call:
  ```
  <root><room>/?fn=find&pattern=**&format=full&sortBy=leaf&limit=1000
  ```
  Followed by repeated `read([cursorSlot.uri])` while `next != null`.
- `plugin/commands/manage-coordination.md:160` — the aspirational
  "*Read the full room via `b3nd_read` on `<root><room>/**`*" becomes
  literally true; the docstring stays as-is.
- `scripts/` — the temporary `/tmp/room-cat.ts` (fan-out clone of
  `loadHistory`) gets a permanent home as `scripts/room-cat.ts` using the
  new `find` verb. The fan-out version remains as a fallback when
  `status().fns` does not include `"find"` (e.g. older rigs).
- The hand-rolled FS smoke rig (`scripts/smoke-rig.ts`) gets the new
  `FsExecutor.walkFiles` method as part of the fs work in §6.3.

The migration is purely additive: cc-chat keeps the fan-out as a fallback
for non-`find`-capable rigs, and uses `fn=find` when capability is
advertised.

---

## 7. `walkViaLs` — caller-invoked polyfill helper

For callers that need to enumerate trees against stores that advertise
only `"ls"`, `b3nd-save` SHOULD export:

```ts
export async function walkViaLs(
  read: <T>(urls: string[]) => Promise<Output<T>[]>,
  prefix: string,
  opts?: { pattern?: string; format?: "full" | "uris"; ... },
): Promise<Output[] | string[]>;
```

`walkViaLs` does shallow `?fn=ls&format=uris` calls level-by-level,
collecting subdirectory URIs (where applicable), then issues
`?fn=read` or `?fn=ls&format=full` for the leaves. It is the **explicit,
caller-invoked** fallback — not auto-engaged by `dispatch` or the rig.

Two reasons it lives in `b3nd-save` and not in `b3nd-core`:

1. It is grammar-aware (knows `?fn=ls&format=uris`, knows that absence of
   children means "leaf"). Grammar awareness belongs in save.
2. It is fully expressible against the existing `ProtocolInterfaceNode`
   read surface — no rig changes needed. The rig stays 1:1; the caller
   chooses to expand.

Implementation is straightforward (recursive descent with a worklist) and
out of scope for this spec — but listing it here makes the
"who-walks-for-non-find-stores" question explicit.

---

## 8. Non-goals and out-of-scope

- **Federation.** A single `fn=find` locator that spans multiple save
  backends (e.g. two stores each owning a sub-prefix) is NOT addressed.
  `b3nd-core/src/rig/rig.ts:683-724` routes each locator to *one*
  connection per its current rules. Multi-store recursive listing is a
  separate design.
- **Field-level filters.** `pattern` is purely a URI-tail-shape filter.
  "All msgs newer than T," "only type=msg, not type=join" — these are
  payload/field-level queries and belong in a future `fn=query`
  conversation, not in `fn=find`.
- **Streaming `read` responses.** `cursor=&limit=` is the v1 answer.
  NDJSON streaming for large `find` responses is a v1.x add if a real
  call site demands it (move msg 1/2).
- **`fn=count` with recursion.** `fn=count` today rejects `pattern`
  push-down on most stores (`b3nd-save/src/fs/store.ts:343-345`,
  `s3/store.ts:333`, etc.). Adding `fn=count` over a recursive walk is a
  natural follow-up (same change-list shape) but not part of v1 — `fn=find`
  callers can `.length` the result when they need a count.
- **Live-tail of recursive listings.** Observe already supports `**`
  patterns (`b3nd-core/src/types/types.ts:238-264`); a `find`-then-`observe`
  combo is the supported pattern. There is no `fn=find+stream` verb.

---

## 9. Acceptance checklist

For this spec to be considered delivered:

- [ ] `b3nd-save/src/url.ts` doc-comment lists `find` as a reserved fn.
- [ ] `b3nd-save/src/read.ts` supports `globstar` option in pattern helpers and `sortBy=leaf`.
- [ ] `b3nd-save/src/dispatch.ts` has a `find` case and emits the trailing cursor slot when `limit` is set.
- [ ] All 10 stores either advertise `"find"` in `status().fns` and pass a shared `find` conformance test, or honestly omit `"find"` and reject `fn=find` calls.
- [ ] `FsExecutor` interface gains `walkFiles`; in-tree implementations (fs, smoke-rig) provide it.
- [ ] `b3nd-save` exports `walkViaLs` for callers that want the fallback.
- [ ] `b3nd-cc-chat/web/app.js` `loadHistory` uses `fn=find` when `status().fns` includes `"find"`, falls back to today's fan-out otherwise.
- [ ] `b3nd-cc-chat/scripts/room-cat.ts` ships and uses `fn=find`.
- [ ] No diff in `b3nd-core`. No diff in `b3nd-move` HTTP routes or codecs. No diff in `b3nd-move` MCP `resources/list` semantics.

---

## 10. Provenance

Synthesized from the coordination in
`immutable://open/cc-chat/20260625093437-listing-spec/`. All four
participants converged (no dissents; one open question — cursor-slot URI
shape — resolved by `core` in their closing message in favor of
re-issuable). Citations throughout reference file:line in the
participant repos as cited in-room; refer to the chat transcript for
the dialectic.
