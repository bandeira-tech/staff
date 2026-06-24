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
   `immutable://open/cc-chat/` and fs root `~/cc-chat-data`, the unified
   URI shape is `immutable://open/cc-chat/<room>/<participant>/<type>/<ts>-<slug>.md`
   (or `.json` for join records). For example:

   - Room meta card:
     ```
     immutable://open/cc-chat/20260624120000-design-review/meta.md
     → ~/cc-chat-data/immutable_open/cc-chat/20260624120000-design-review/meta.md.bin
     ```
   - Manager message:
     ```
     immutable://open/cc-chat/20260624120000-design-review/manager/msg/20260624120100-x9q2mp.md
     → ~/cc-chat-data/immutable_open/cc-chat/20260624120000-design-review/manager/msg/20260624120100-x9q2mp.md.bin
     ```
   - Participant join:
     ```
     immutable://open/cc-chat/20260624120000-design-review/src-auth/join/20260624120005-abc123.json
     → ~/cc-chat-data/immutable_open/cc-chat/20260624120000-design-review/src-auth/join/20260624120005-abc123.json.bin
     ```

   The 7 URI types are: `join`, `msg`, `mention`, `pause`, `resume`, `end`, `output`.
   All land under `<room>/<participant>/<type>/`.

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
