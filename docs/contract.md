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
