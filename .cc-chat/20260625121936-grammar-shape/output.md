# Spec revision — URL grammar shape for `read` and `observe`

**Status:** v2, agreed in `immutable://open/cc-chat/20260625121936-grammar-shape/`
by representatives of `b3nd-core`, `b3nd-move`, `b3nd-save`, and `b3nd-cc-chat`.
**Supersedes:** `./.cc-chat/20260625093437-listing-spec/output.md` §3.1, §3.2,
§3.5, and parts of §6 (the `?pattern=` mechanism). Round 1's other
commitments — `sortBy=leaf`, cursor-as-trailing-slot, capability advertisement
via `status().fns`, the per-store push-down matrix, zero-changes to
`b3nd-core`/`b3nd-move` — **all survive unchanged**.

**Scope:** the *shape* of the URL string passed to `read(url[])` and
`observe(url[])`. Round 1 settled on `?fn=find&pattern=**`; the user pushed
back on the shape itself ("why a `?pattern=` param at all when observe puts
the glob in the URI?"). Round 2 redid the analysis from first principles.
This revision is the result.

---

## 1. TL;DR of the change

Round 1 said: `read([ "<root><room>/?fn=find&pattern=**&sortBy=leaf&limit=200" ])`.
Round 2 says: `read([ "<root><room>/**?fn=find&sortBy=leaf&limit=200" ])`.

The glob moves out of `?pattern=` and into the URL's path component — the
**same shape `observe` has used since day one** (`b3nd-core/src/types/
types.ts:255`, `b3nd-core/src/match-pattern/match-pattern.ts`). `?pattern=`
is dropped from the spec. `?fn=` survives and is **required** whenever the
URL contains wildcards (silent-default-trap mitigation, §3.4).

The deeper change is architectural: **one glob grammar across read +
observe**, not two. `b3nd-save/src/read.ts:177-228`
(`patternToRegex`/`patternToRegexBody`/`patternToSqlLike`) is **deleted** in
favor of routing through `b3nd-core/src/match-pattern/match-pattern.ts`'s
`compilePattern` — the same engine that already powers route matching and
observe.

---

## 2. The two shapes, defined

### Shape A — round 1's `?fn=find&pattern=…`

```
read([ "<root><room>/?fn=find&pattern=alice/**&sortBy=leaf&limit=200" ])
observe([ "<root><room>/**" ])
```

URI = literal routing prefix. Wildcards live in `?pattern=`. Verb in
`?fn=`. **Two grammars on one rig:** URI-with-glob for observe, URL+param
for read.

### Shape B — round 2's choice (this revision)

```
read([ "<root><room>/alice/**?fn=find&sortBy=leaf&limit=200" ])
observe([ "<root><room>/**" ])
```

URI carries the wildcards. Verb is **explicit** via `?fn=` when wildcards
are present (no shape-inferred default; §3.4 explains why). For pure point
reads (no wildcards), `?fn=` is omitted — the URL is a bare URI.

**One grammar** across `read` and `observe`. The cc-chat skill already
documents this implicitly: `SKILL.md:131-169` writes `<root><room>/**` for
both surfaces.

---

## 3. Grammar (normative)

### 3.1 The URL

```
<uri-with-glob>[?fn=<verb>][&sortBy=<uri|leaf|<field>>][&sortOrder=<asc|desc>]
              [&limit=<n>][&page=<n>|&cursor=<opaque>][&format=<full|uris>]
              [&fields=<csv>]
```

- `<uri-with-glob>` is a locator whose path component may contain
  `?` / `*` / `**` wildcards (§3.3). Routing identity = the literal portion
  before the first wildcard; same prefix-extraction `b3nd-core/src/
  match-pattern/match-pattern.ts` already performs for observe and routes.
- `?fn=<verb>` is the verb declaration. **Required when the URL contains
  wildcards.** Optional (and defaults to `read`) when the URL is a bare URI.
  Reserved verbs: `read`, `ls`, `find`, `count`, `x-<ns>.<name>` (extensions).
- Other query params (`sortBy`, `limit`, `cursor`, etc.) are unchanged from
  round 1.

### 3.2 Verbs and their valid URL shapes

| Verb       | Valid URL shape                              | Returns                              |
|------------|----------------------------------------------|--------------------------------------|
| `read`     | Bare URI (no wildcards)                      | One Output, payload of that resource |
| `ls`       | URI with `?` or `*` in trailing segment (no `**`) | `Output[]` of direct children; `format=uris` returns `string[]` |
| `find`     | URI with `**` anywhere                       | `Output[]` of all matching descendants; `format=uris` returns `string[]` |
| `count`    | Any URI shape; always requires explicit `?fn=count` | Numeric count of matched entries (number) |
| `x-<ns>.<name>` | Any URI shape; always explicit            | Provider-defined                     |

The default verbs (`read`/`ls`/`find`) are **explicit, not inferred** —
even though their valid URL shapes don't overlap, the verb must be declared
when wildcards are present (see §3.4). For a bare URI (no wildcards), `?fn=`
may be omitted and defaults to `read`. This is the only inference.

### 3.3 Glob grammar (one source of truth — see §3.3.1 for the actual delta)

The grammar the caller writes — what user code, docs, and tests all see —
is the table below. `b3nd-core/src/match-pattern.ts` already implements a
**subset** of this grammar (it has powered route matching and observe
subscriptions since day one); §3.3.1 documents the small delta and how
save closes it without changing core.

| Token | Means                                              | Crosses `/`? | Valid under |
|-------|----------------------------------------------------|--------------|-------------|
| `?`   | exactly one non-`/` character                      | no           | `ls`, `find` |
| `*`   | zero or more non-`/` characters (one segment)      | no           | `ls`, `find` |
| `**`  | zero or more segments (any chars including `/`)    | **yes**      | **`find` only** |

Rules:
- `*` and `**` must be **complete segments** — the existing
  `match-pattern.ts` error (`pattern segment "<seg>": "*" and "**" must be
  complete segments`) applies verbatim. `<root>/al*` is invalid; write
  `<root>/al?/foo` or compose with `/`.
- `**` is **only valid under `?fn=find`**. Passing a URL containing `**`
  with `?fn=ls` (or `?fn=count`) MUST throw at parse time — fail loud per
  the round-1 precedent.
- A URL containing wildcards without `?fn=` MUST throw at parse time. There
  is **no shape-inferred verb** (§3.4).

Anchoring: the pattern matches the URL tail after the routing prefix; same
behavior as `matchesUriPattern` does today (`b3nd-save/src/read.ts:192-199`,
to be replaced by the wrapper described in §3.3.1).

### 3.3.1 Amendment — save-side wrapper around `compilePattern`

**Why this section exists.** §3.3 above promises the user-facing grammar
matches `b3nd-core/src/match-pattern.ts`. The first dev-coordination round
(`20260625153505-find-fn-impl`) surfaced that this is not literally true
today — `compilePattern` is a strict subset of what §3.3 promises. The
honest resolution is to keep core unchanged (§7.1 commitment is
load-bearing for routing/observe semantics) and have save ship a thin
wrapper that closes the delta. Caller-visible behavior matches §3.3
exactly; the wrapping is an internal implementation detail.

**The actual `compilePattern` grammar today** (`b3nd-core/src/
match-pattern/match-pattern.ts:46-58`):

| Token | What core does today                                       | What §3.3 promises | Delta |
|-------|------------------------------------------------------------|--------------------|-------|
| `?`   | not recognized (parses as literal `?`)                     | one non-`/` char   | **delta** |
| `*`   | one or more non-`/` chars (`[^/]+`)                        | zero or more (`[^/]*`) | **delta on empty-segment matching** |
| `**`  | only valid as the final segment; throws otherwise          | any position       | **delta on mid-`**` patterns** |

**The wrapper.** Save ships `compileSaveGlob(pattern)` (proposed location:
`b3nd-save/src/glob.ts`, or extend `b3nd-save/src/read.ts`). Behavior:

1. **Patterns inside `compilePattern`'s supported subset** — single trailing
   `**` (or none), no `?`, every `*` segment matches a non-empty segment —
   delegate to `compilePattern` 1:1. Same engine, same code path, same fast
   paths. Routing-layer matches and save-layer matches agree byte-for-byte.
2. **Patterns outside that subset** — `?`, mid-`**`, or empty-segment `*` —
   save compiles its own regex with the §3.3 semantics. The wrapper detects
   which path applies and dispatches; the choice is invisible to callers.

`compileSaveGlob` returns the same `RegExp`-or-tester shape `compilePattern`
returns today, so every existing site that uses `compilePattern` output
can swap in `compileSaveGlob` without other changes.

**SQL-LIKE adapter.** The SQL push-down path (`patternToSqlLike` deletion
notwithstanding) needs a separate adapter because SQL-LIKE has different
metacharacters than regex. Same shape: defer to a `compilePattern`-style
helper for the supported subset; do save-local string building for the
broader grammar (`**` → `%`, `?` → `_`, etc.).

**Important consequence: foundation PR ships TWO save-side adapters, not
one.** `compileSaveGlob` for the regex path, plus a SQL-LIKE adapter for
SQL push-down. Both are small. Both are honest about wrapping vs
extending core. Round-1's "patternToRegex / patternToRegexBody /
patternToSqlLike all deleted" is amended to: "deleted as separate
maintained grammars; their *output shapes* survive inside the two new
adapters, which now defer to core's `compilePattern` for the supported
subset rather than reimplementing the wheel."

**Tests.** The foundation PR's shared find-conformance suite MUST
exercise both wrapper paths — patterns inside core's subset and patterns
outside it — and assert byte-equality with `compilePattern` for the
inside-subset case. Without that, the wrapper could silently drift from
core's grammar where they're supposed to agree.

### 3.4 Why `?fn=` is required when wildcards are present

Round 2 spent significant time on the question "can the verb be inferred
from the URL's wildcard shape?" The shape would be:

- no wildcards → `fn=read`
- `*` / `?` only → `fn=ls`
- `**` anywhere → `fn=find`

The win: shorter URLs, no `?fn=` to remember for the 95% case.
The cost (`save/msg/20260625122456-apcpkj`, §"silent-default trap"):

> Typo `*/foo*` instead of `**/foo*` → routes to `fn=ls` (shallow);
> returns only depth-1 matches. Caller sees a *plausible* short list.
> **Silent miss — the worst kind.**

The two valid readings (`*` shallow, `**` recursive) are one keystroke
apart, both syntactically legal, both succeed, and they return **different
sets**. A typo doesn't blow up — it returns a wrong-but-plausible answer.
That class of bug is exactly what drove round 1 to a separate `fn=find`
verb in the first place; inferring the verb from glob density would
regress that decision.

**Resolution:** keep the wildcards in the URL (shape B's symmetry win) but
require `?fn=` to disambiguate intent whenever wildcards are present. The
URL string is still shorter than shape A's `?fn=find&pattern=`; the
caller-experience win — read locators match observe locators modulo a
`?fn=find` tail — survives. The silent-trap is closed because the only
URL shape with the trap (`*` vs `**`) requires the explicit verb to parse
at all.

Concretely, what a builder writes:

```
read([    "<root><room>/**?fn=find" ])
observe([ "<root><room>/**" ])
```

The URI shape is identical; the `?fn=find` is the read-side declaration of
intent. Reviewers see the two strings side-by-side and immediately
understand they cover the same set.

### 3.5 Pagination, sort, format — unchanged from round 1

`cursor=&limit=`, `sortBy=uri|leaf|<field>`, `sortOrder=asc|desc`,
`format=full|uris`, `fields=csv` — all behave exactly as round 1 specified.
The cursor mechanism (trailing slot in `outputs-frame`, slot URI is a
re-issuable locator) carries forward unchanged. `sortBy=leaf` (basename
`localeCompare`) carries forward unchanged.

The cursor URI under shape B is `<url-with-glob>?fn=find&...&cursor=<opaque>`
— same composition rule, same trailing-slot wire convention.

---

## 4. Table A — per-use-case shape comparison

Synthesized from the four participants' tables. ☑ = both shapes express the
case identically (no semantic delta). ⚠ = shape requires an extra explicit
param to express the case.

| # | Use case                                  | Shape A                                                   | Shape B (this revision)                       | Delta |
|---|-------------------------------------------|-----------------------------------------------------------|-----------------------------------------------|-------|
| 1 | Read a single resource                    | `<root><room>/meta.md`                                    | `<root><room>/meta.md`                        | ☑     |
| 2 | List direct children (shallow)            | `<root><room>/alice/msg/?fn=ls`                           | `<root><room>/alice/msg/*?fn=ls`              | ☑     |
| 3 | List every descendant                     | `<root><room>/?fn=find&pattern=**`                        | `<root><room>/**?fn=find`                     | ☑     |
| 4 | Filter (only `msg` leaves anywhere)       | `<root><room>/?fn=find&pattern=**/msg/*.md`               | `<root><room>/**/msg/*.md?fn=find`            | ☑     |
| 5 | Under one sub-prefix (alice only)         | `<root><room>/?fn=find&pattern=alice/**`                  | `<root><room>/alice/**?fn=find`               | ☑     |
| 6a | Count direct children                    | `<root><room>/?fn=count`                                  | `<root><room>/?fn=count`                      | ☑     |
| 6b | Count descendants                        | `<root><room>/?fn=count&pattern=**`                       | `<root><room>/**?fn=count`                    | ☑     |
| 7 | Paginate long recursive listing           | `<root><room>/?fn=find&pattern=**&limit=200&cursor=<op>`  | `<root><room>/**?fn=find&limit=200&cursor=<op>` | ☑   |
| 8 | Sort by leaf basename                     | `…&sortBy=leaf`                                           | `…&sortBy=leaf`                               | ☑     |
| 9 | Observe writes under prefix               | `<root><room>/**`                                         | `<root><room>/**`                             | ☑ (observe is **already shape B**) |
| 10 | Observe filtered (mentions of bob)       | `<root><room>/**/mention/bob/**`                          | `<root><room>/**/mention/bob/**`              | ☑     |
| 11 | Project fields                           | `…&fields=ts,who`                                         | `…&fields=ts,who`                             | ☑     |
| 12 | Extension fn (`x-feed.window`)           | `<root><room>/?fn=x-feed.window&…`                        | `<root><room>/?fn=x-feed.window&…`            | ☑     |

**Capability delta: zero.** Every use case the caller has today (single
read, shallow list, recursive list, filtered list, sub-prefix list, count,
paginate, sort, observe, observe-filter, project, extension) is expressible
in **both** shapes with identical results.

**Where the strings differ (rows 3, 4, 5, 7):** shape B's URL is shorter
and **identical in shape to the observe locator** (rows 9, 10). The shape A
versions require the caller to type two strings for the same set — one for
read (`?fn=find&pattern=**`), one for observe (`**`).

**Where the strings agree (rows 1, 2, 6, 8, 9, 10, 11, 12):** zero
difference; the row is the same query whether interpreted as A or B.

---

## 5. Table B — tradeoff dimensions

Synthesized from the four participants' tables; verdicts reconciled with
the participant authorities (core owns dims 1, 2, 3, 7; move owns dims 5,
6, 9, 11; save owns dims 4, 8, 12; cc-chat owns 10 + cross-cuts).

| #  | Dimension                                              | Shape A                                                                                                   | Shape B (this revision)                                                              | Verdict |
|----|--------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|---------|
| 1  | RFC 3986 / URI vs URL doctrine                         | Identity in URI, directives in query — textbook                                                           | Wildcards in URI portion. But `types.ts:184-192` already names wildcards as legitimate locator content (set-identifiers, not directives); observe is the precedent | **B** (zero net cost — observe already shipped this) |
| 2  | Symmetry between read and observe                      | Asymmetric: `<root>/?fn=find&pattern=**` vs `<root>/**`                                                   | Symmetric: same `<root>/**` carries on both surfaces, plus `?fn=find` on read         | **B decisive** — 17 literal occurrences of `<root><room>/**` in cc-chat docs + code prove the convention is already shape B everywhere except round-1's read |
| 3  | Parser complexity at rig / connection                  | `accepts(url)` runs `compilePattern` on the full locator; works                                           | Same — `compilePattern` already handles `**` via `startsWith` prefix extraction (`rig/connection.ts:119`) | **Tie** — zero new rig code in either |
| 4  | Parser complexity at store / handler                   | Two glob grammars maintained: `b3nd-save/src/read.ts:177` for `?pattern=` + `b3nd-core/src/match-pattern` for routes/observe | One glob grammar: save deletes its impl, calls `compilePattern`. New `splitLocatorGlob(uri) → {prefix, glob}` helper at parse time | **B** (negative cost — code deleted, not added; the round-1 `{globstar: true}` extension to `patternToRegex` becomes unnecessary) |
| 5  | Cursor / pagination composability                      | `…&cursor=<opaque>` appended cleanly                                                                      | `…&cursor=<opaque>` appended cleanly                                                  | **Tie** — cursor is request-time in both; trailing-slot mechanism survives unchanged |
| 6  | Composability with `receive` (point-write)             | `receive` URIs are concrete; no wildcards                                                                 | `receive` URIs are concrete; no wildcards                                              | **Tie** — receive is unaffected by either shape |
| 7  | Verb explicitness — when is `?fn=` needed              | Always explicit. Loud and predictable.                                                                    | **`?fn=` required when wildcards present** (§3.4 silent-trap mitigation); optional/defaults-`read` for bare URIs | **Tie under this revision** — round-2-debated; concession to A's argument by requiring explicit verb on wildcards. Without that mitigation, A wins this dim outright |
| 8  | Backward compat with today's `?fn=ls&pattern=` callers | Trivial — it IS today                                                                                     | Dual-accept in `b3nd-save/src/url.ts` for a transition window; then `?pattern=` removed | **A** (small migration cost) — but round-1's spec is unreleased and dual-accept covers in-flight callers |
| 9  | MCP `resources/list` / `resources/subscribe` alignment | `subscribe` takes `<uri>/**`; `b3nd_read` takes `?fn=&pattern=`. Two grammars per rig.                    | `subscribe` and `b3nd_read` take the same URL+glob; tool description shrinks         | **B decisive** — the load-bearing argument for MCP clients (LLMs especially), see move msg 2/4 |
| 10 | Extension fn (`x-*.*`) ergonomics                      | `?fn=x-foo&…` — uniform                                                                                   | `?fn=x-foo&…` — same                                                                  | **Tie** — extensions always explicit either way |
| 11 | URL length / wire framing                              | `?pattern=…` overhead per locator                                                                          | ~10 B shorter; same `lenSize=2` u16 framing                                            | **B trivial** — not load-bearing |
| 12 | Failure mode when store advertises only simpler shape  | Store advertises `fns: [ls, find]`; absence → loud throw on `?fn=find`                                    | Same mechanism; absence → loud throw on URL containing `**`. Save inspects locator at parse time | **Tie** (under this revision's mandatory-`?fn=`); the explicit verb makes capability rejection unambiguous |

### Tally

- **B wins decisively:** 2 (symmetry), 9 (MCP). Both are about *cognitive
  contract* / *interface coherence*, not raw expressiveness.
- **B wins on cost:** 4 (one fewer glob grammar to maintain), 11 (trivially
  shorter URLs).
- **A wins:** 8 (back-compat migration is small but non-zero).
- **B-on-doctrine, conditionally:** 1 (B doesn't violate RFC 3986 because
  observe already established the precedent and `types.ts:184-192` codifies
  it).
- **Ties:** 3, 5, 6, 7 (under this revision's mandatory-`?fn=` rule), 10, 12.

Two decisive wins for B (symmetry, MCP) outweigh one moderate A win
(back-compat migration). B's other wins are on ongoing-cost dimensions
(code deletion, URL length); A's win is on a one-time migration cost
(transition window in save's parser). The cost-direction asymmetry seals
the decision: **adopt B**.

---

## 6. Recommendation: Shape B with mandatory `?fn=` when wildcards are present

All four participants converged on Shape B. The internal disagreement was
on whether the verb can be inferred from URL shape (core, move: yes-ish;
save, cc-chat: no, silent-default trap). This revision lands on the
conservative side: **verb is explicit whenever wildcards are present**.

The user-visible shape:

```
read([ "<root><room>/meta.md" ])                      // no wildcards, fn= optional
read([ "<root><room>/alice/msg/*?fn=ls" ])            // shallow ls
read([ "<root><room>/**?fn=find" ])                    // recursive
read([ "<root><room>/**/msg/*.md?fn=find" ])           // recursive + filter
read([ "<root><room>/?fn=count" ])                     // count direct children
read([ "<root><room>/**?fn=count" ])                   // count descendants
observe([ "<root><room>/**" ])                         // unchanged
receive([ ["<root><room>/alice/msg/123.md", payload] ]) // unchanged
```

The `?fn=find` tail on read locators is the **only** difference between a
read and an observe locator covering the same set. Reviewing code, the
shape similarity makes the intent obvious; the explicit verb makes it
unambiguous.

---

## 7. Change-list per package — revised from round 1

### 7.1 `b3nd-core` — still zero changes

All round-1 reasoning stands. Locators are opaque to the framework; the
rig dispatches 1:1; `compilePattern` already handles URL-with-glob locators
for both routing and observe. Shape B is doctrinally compatible with the
URI/URL distinction at `types.ts:184-192` (wildcards are legitimate
locator-but-not-uri content, alongside query directives).

### 7.2 `b3nd-move` — still zero changes

- HTTP `read`/`observe` routes are grammar-blind (`http/read.ts:27-45`,
  `http/observe.ts:19-35`). The `?u=` url-list codec is byte-transparent.
- MCP `tools/call b3nd_read` (`mcp/service.ts:142-155`) still takes opaque
  URLs. Tool description **shrinks** under shape B (no need to enumerate
  `?pattern=` semantics; one grammar matches `resources/subscribe`).
- MCP `resources/list` stays shallow / capability-only.
- Cursor as trailing slot in `outputs-frame` — unchanged.

### 7.3 `b3nd-save` — revised from round 1

**Code DELETED (vs round 1):**
- `b3nd-save/src/read.ts:163-228` — `patternToRegex`, `patternToRegexBody`,
  `patternToSqlLike`, `matchesUriPattern`. Replaced by calls into
  `b3nd-core/src/match-pattern/match-pattern.ts`'s `compilePattern` (and a
  thin SQL-LIKE adapter where push-down requires it).
- The round-1 `{globstar: true}` option that was going to be added to those
  helpers — no longer needed.

**Code ADDED:**
- `b3nd-save/src/url.ts` — `splitLocatorGlob(uri) → {prefix, glob}` helper.
  Borrows the prefix-extraction rule from `compilePattern`. Called by
  `parseUrl` to populate `{prefix, glob}` regardless of whether the caller
  wrote shape A (`?pattern=`) or shape B (glob-in-URI).
- `b3nd-save/src/url.ts` — `?fn=` validation: throw when URL contains
  wildcards and `?fn=` is absent. Throw when URL contains `**` and
  `?fn=` is anything other than `find`. Throw when URL contains `*` /
  `?` (no `**`) and `?fn=` is anything other than `ls` (or `count`).
- `b3nd-save/src/url.ts` — dual-accept transition: `?pattern=` still
  parses; internally normalized to `{prefix, glob}`. Logged as deprecated.
  Removal scheduled one minor version out.

**Unchanged from round 1:**
- `b3nd-save/src/dispatch.ts` — `find` case added; cursor-as-trailing-slot
  emission. (The mechanism is the same; the only difference is that
  `parsed.params.pattern` is no longer the source — `parsed.glob` is.)
- Per-store push-down matrix — every entry in round 1's table survives
  unchanged because every backend still consumes `{prefix, glob}` as two
  arguments. Shape B doesn't move the prefix into the glob string; it just
  changes where the parser reads them from.
  - memory/ipfs/localstorage/indexeddb: drop shallow-tail filter
  - sqlite/postgres: drop `NOT LIKE %/%`; replace `patternToSqlLike` with
    a `compilePattern`-driven SQL adapter
  - mongo/elasticsearch: replace `[^/]+` regex body with `compilePattern`
    output
  - s3: drop `tail.includes("/")` filter
  - fs: new `FsExecutor.walkFiles` method (only executor extension needed)
- `status().fns` capability advertisement — every store ships `"find"`
  when its handler is implemented; honest omission otherwise.
- `sortBy=leaf` — unchanged.
- Cursor-as-trailing-slot — unchanged.

### 7.4 `b3nd-cc-chat` — caller migration revised

- `web/app.js` `loadHistory` (`:400-461`) collapses to one paginated call:
  ```js
  const url = `${root}${room}/**?fn=find&format=full&sortBy=leaf&limit=1000`;
  let next = url;
  while (next) {
    const outs = await readBatch([next]);
    const last = outs[outs.length - 1];
    const cursor = (last?.[1] && typeof last[1] === "object" && "next" in last[1])
      ? (last[1] as { next: string | null }).next
      : null;
    for (const [uri, payload] of outs.slice(0, -1)) render(uri, payload);
    next = cursor ? `${url}&cursor=${cursor}` : null;
  }
  ```
- `plugin/commands/manage-coordination.md:160` — the aspirational *"Read
  the full room via `b3nd_read` on `<root><room>/**`"* becomes literally
  true with the addition of `?fn=find` (still the same URI shape, just
  with an explicit verb declaration).
- `plugin/skills/cc-chat/SKILL.md` — teaches **one grammar** (URL+glob)
  for both observe and read. The Quick Reference adds `?fn=find` to the
  read entry; the observe entry stays identical to today.
- `scripts/room-cat.ts` (lifted from `/tmp/room-cat.ts`) uses `?fn=find`
  when `status().fns` includes `"find"`; falls back to fan-out otherwise.
- The hand-rolled FS smoke rig (`scripts/smoke-rig.ts`) gets
  `FsExecutor.walkFiles`.

---

## 8. Migration sequence

1. **`b3nd-save/src/url.ts`** lands `splitLocatorGlob`, `?fn=` validation,
   and dual-accept for `?pattern=`. Shape A and shape B coexist; shape A
   is logged as deprecated.
2. **`b3nd-save/src/read.ts`** deletes `patternToRegex` /
   `patternToRegexBody` / `patternToSqlLike`. Per-store handlers migrate
   to `compilePattern`-driven push-down or in-process post-filter.
3. **Per-store handlers** land their `find` push-down (one PR per store —
   the round-1 matrix); each store adds `"find"` to `status().fns` when
   ready.
4. **`b3nd-cc-chat`** migrates `loadHistory`, ships `scripts/room-cat.ts`
   using `?fn=find`, updates `SKILL.md` and `manage-coordination.md` to
   the new shape.
5. **One minor version later:** `?pattern=` removed from `b3nd-save/src/
   url.ts`. Round-1's `patternToRegex`/etc. are already gone (step 2);
   this step is purely the parser-side deprecation.

No step in this sequence requires coordinated multi-package release —
each step is independently shippable.

---

## 9. Acceptance checklist (revised from round 1)

- [ ] `b3nd-save/src/url.ts` parses URL+glob locators and emits
      `{prefix, glob, fn}` for downstream handlers.
- [ ] `b3nd-save/src/url.ts` rejects URLs containing wildcards without
      `?fn=` (loud parse error).
- [ ] `b3nd-save/src/url.ts` rejects URLs containing `**` with `?fn=ls`
      (or any non-`find` verb).
- [ ] `b3nd-save/src/url.ts` accepts `?pattern=` (dual-accept transition),
      logged as deprecated.
- [ ] `b3nd-save/src/read.ts`'s `patternToRegex` / `patternToRegexBody` /
      `patternToSqlLike` / `matchesUriPattern` are deleted; all glob
      compilation goes through `b3nd-core/src/match-pattern.ts`.
- [ ] `b3nd-save/src/dispatch.ts` has a `find` case; emits the trailing
      cursor slot when `limit` is set.
- [ ] All 10 stores either advertise `"find"` in `status().fns` and pass a
      shared `find` conformance test, or honestly omit `"find"` and reject
      the verb.
- [ ] `FsExecutor` interface gains `walkFiles`; in-tree implementations
      (fs, smoke-rig) provide it.
- [ ] `b3nd-save` exports `walkViaLs` for callers that want the fallback
      against non-`find` stores (unchanged from round 1).
- [ ] `b3nd-cc-chat/web/app.js` `loadHistory` uses
      `<root><room>/**?fn=find` when `status().fns` includes `"find"`,
      falls back to today's fan-out otherwise.
- [ ] `b3nd-cc-chat/scripts/room-cat.ts` ships using `?fn=find`.
- [ ] `b3nd-cc-chat/plugin/commands/manage-coordination.md:160`'s read
      aspiration is updated to the literal `<root><room>/**?fn=find` form.
- [ ] `b3nd-cc-chat/plugin/skills/cc-chat/SKILL.md` Quick Reference
      teaches one glob grammar across observe and read.
- [ ] No diff in `b3nd-core`. No diff in `b3nd-move` HTTP routes or
      codecs. No diff in `b3nd-move` MCP `resources/list` semantics.

---

## 10. Provenance

Synthesized from `immutable://open/cc-chat/20260625121936-grammar-shape/`.
All four participants converged on Shape B. The internal disagreement
(shape-inferred verbs vs always-explicit `?fn=` when wildcards present)
was resolved in favor of the conservative explicit-verb rule — driven by
save's silent-default-trap argument (`save/msg/20260625122456-apcpkj`)
and cc-chat's reconciliation (`cc-chat/msg/20260625122550-6v8uhf`).

Round 1's deliverable at
`./.cc-chat/20260625093437-listing-spec/output.md` is **superseded only
in the sections this revision touches** (URL grammar shape, `?pattern=`
mechanism, the relevant parts of the change-list). Round 1's `sortBy=leaf`,
cursor-as-trailing-slot, capability advertisement via `status().fns`, the
per-store push-down matrix, zero-changes to `b3nd-core` and `b3nd-move`,
and the `walkViaLs` helper export — all carry forward unchanged.

The room transcripts are at:
- Round 1: `immutable://open/cc-chat/20260625093437-listing-spec/**?fn=find`
- Round 2: `immutable://open/cc-chat/20260625121936-grammar-shape/**?fn=find`

(These URIs are written in the shape this revision proposes — under shape A,
they'd be `<…>/?fn=find&pattern=**`. Q.E.D.)
