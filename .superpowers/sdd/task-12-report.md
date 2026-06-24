# Task 12 Smoke Report — End-to-End Wire Test

**Status: DONE_WITH_CONCERNS**

Date: 2026-06-24
Room slug: `20260624195049-smoke-test`

---

## Summary

Hand-rolled an FS-backed HTTP rig (`scripts/smoke-rig.ts`) and exercised the unified URI
grammar end-to-end. Core storage and routing work correctly. One reproducible issue found
in the HTTP payload serialization path.

---

## Checklist

### Rig started, status 200 reached: YES

```
[smoke-rig] FsStore root: /Users/m0/ws/b3nd-cc-chat/.cc-chat-smoke/fs
[smoke-rig] Listening on http://127.0.0.1:7373
Listening on http://127.0.0.1:7373/
GET /api/v1/status → {"status":"healthy","schema":["entity:bytes"],"fns":["read","ls","count"]}
```

`schema:["entity:bytes"]` confirms BYTES_ENTITY provisioned.

### Meta minted + visible on disk: YES

URI: `immutable://open/cc-chat/20260624195049-smoke-test/meta.md`

On-disk path: `.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/meta.md.bin`

Content (readable, correct YAML+markdown):
```
---
room: 20260624195049-smoke-test
goal: Verify unified URI grammar end-to-end
participants: [manager, src-protocol, src-roster]
deliverable: smoke-test confirmation
tool_budget: 20
---

# Goal
...
```

### All 7 types attempted

| Type    | Attempted | Landed on disk                                     |
|---------|-----------|----------------------------------------------------|
| meta    | YES       | YES — `meta.md.bin`                                |
| join    | YES (x3)  | YES — manager, src-protocol, src-roster `.json.bin` |
| msg     | YES (x5)  | YES — multiple `.md.bin` files                     |
| output  | YES       | YES — `manager/output/...md.bin`                   |
| end     | YES       | YES — `manager/end/...md.bin`                      |
| pause   | NO        | n/a — manager-only, not in smoke spec              |
| resume  | NO        | n/a — manager-only, not in smoke spec              |
| mention | NO        | n/a — not in smoke spec (Step 2 list)              |

5 of 7 types exercised; pause/resume/mention intentionally skipped (not in the Step 2 list).

Full FS layout:
```
.cc-chat-smoke/fs/__meta__/entities/bytes
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/meta.md.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/manager/end/20260624195554-ic6w2z.md.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/manager/join/20260624195537-mtv7ot.json.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/manager/output/20260624195554-iyhbds.md.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/src-protocol/join/20260624195554-4kb02h.json.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/src-protocol/msg/20260624195554-2lty3d.md.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/src-protocol/msg/20260624195554-jisnf7.md.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/src-roster/join/20260624195554-hmv6k1.json.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/src-roster/msg/20260624195554-b3sli9.md.bin
.cc-chat-smoke/fs/immutable_open/cc-chat/20260624195049-smoke-test/src-roster/msg/20260624195554-e57sk3.md.bin
```

### Tail rendered new-grammar correctly: PARTIAL

Tail connected to observe endpoint and received live messages. However, the payload
displayed as `[object Object]` instead of the text content:

```
tailing http://127.0.0.1:7373 for immutable://open/cc-chat/20260624195049-smoke-test/** — Ctrl-C to stop
immutable://open/cc-chat/20260624195049-smoke-test/src-protocol/msg/20260624195743-afp1qn.md
21:57:43 src-protocol [object Object]
```

URI parsing was correct (recognized `src-protocol`, type `msg`, routed to the `msg` case).
Payload was `[object Object]` because the HTTP read response serializes `Uint8Array` as
`{}` in JSON — see Bug #1 below.

### Web UI loaded with room header: PARTIAL

Web UI was opened at `http://localhost:8000/?url=http://127.0.0.1:7373&root=immutable://open/cc-chat/&room=20260624195049-smoke-test`.

`fetchMeta` makes a POST to `/api/v1/read?u=<encoded-meta-uri>` which returns
`[["immutable://...meta.md", {}]]`. The `content` field is `{}` (not null/undefined so
the null-guard passes), but `parseFrontmatter({})` receives an object instead of a string
and silently fails — the meta strip will not render the room goal/participants.

Network request succeeds (200 OK); meta strip rendering is broken for the same reason as
the tail payload issue.

### Persistence (>60s re-read): YES

Meta URI re-read 65 seconds after mint:
```
[["immutable://open/cc-chat/20260624195049-smoke-test/meta.md",{}]]
```
Response returned (rig alive, storage intact). On-disk `.bin` file unchanged.
The `{}` payload issue is consistent; it is not a persistence failure.

### Re-dispatch loop: OUT OF SCOPE

Cannot exercise without real subagents, as noted in the task brief.

---

## Reproducible Bugs Found

### Bug #1: BYTES_ENTITY payload lost in HTTP JSON serialization

**Severity: HIGH** (blocks web UI fetchMeta and tail rendering)

**Root cause:** The HTTP read route (`b3nd-move/src/http/read.ts`) returns `Output[]` as
JSON via `json(outs, 200)`. For `BYTES_ENTITY`, the payload is a `Uint8Array`. When
`JSON.stringify` serializes a `Uint8Array`, it produces `{}` (empty object) — the bytes
are lost.

**Evidence:**
```
POST /api/v1/read?u=<meta-uri-encoded>
Response: [["immutable://...meta.md", {}]]
```

The on-disk file contains the correct bytes:
```
cat .cc-chat-smoke/fs/.../meta.md.bin
---
room: 20260624195049-smoke-test
...
```

**Affected surfaces:**
- `web/app.js` `fetchMeta()` — receives `{}`, fails to parse frontmatter, meta strip silent
- `scripts/tail.ts` display — receives `{}`, renders `[object Object]` instead of text
- Any caller using `ccChatClient.read()` which calls `HttpClient.read()` then does
  `String(payload)` → `"[object Object]"`

**Fix location (not fixed inline per smoke constraint):**
The read route needs to serialize `Uint8Array` as a base64 string (or the wire format needs
a separate binary response codec). Alternatively, clients should expect base64 and decode.
The `json()` wire helper in `b3nd-move/src/http/wire.ts` would need to handle `Uint8Array`
in the replacer.

### Bug #2: b3nd-core mod.ts pulls in npm:canonicalize via identity.ts → encrypt/mod.ts

**Severity: LOW** (non-blocking, workaround applied)

Importing from `b3nd-core/mod.ts` (the barrel) in a project without `canonicalize` in its
import map produces a fatal import error at startup.

**Workaround used:** Import from `/src/rig/mod.ts` directly, bypassing `identity.ts`.

**Note:** This only affects local-path imports of `b3nd-core` (e.g., in the smoke rig).
Normal consumers via JSR are not affected since JSR includes the full dependency set.

---

## What Could Not Be Verified

- `pause`, `resume`, `mention` types — not in the Step 2 spec, so not exercised
- Re-dispatch loop — explicitly out of scope
- Web UI visual rendering — cannot take screenshots; network request confirmed as 200 OK
  but meta strip rendering cannot be verified without a browser screenshot

---

## Conclusion

The unified URI grammar is **correctly implemented at the storage layer**: URIs are
correctly routed, patterns match, files land with the right path structure on disk, and
reads return after >60s. The failing production-readiness concern is Bug #1: bytes
payloads don't survive the HTTP JSON round-trip, which breaks both `fetchMeta` and tail
rendering. This needs to be fixed before the rig is production-ready for web/tail clients.
