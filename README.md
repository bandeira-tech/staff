STAFF by BANDEIRA✶TECH
======================

Staff turns Claude into Chief of Staff, to recruit and instruct other agents
to turn vision into validated reality.

Start working with zero setup, and grow your own system of Traits, Roles,
Plays, Teams, Staff and Sessions as you go.

All your data locally, and easily replicated wherever you need it.

```
/{your choice}
    /traits/{name}/main.md
    /roles/{name}/main.md
    /plays/{name}/main.md
    /teams/{name}/main.md
    /staff/{name}/main.md
    /sessions/{name}/{ts}-{main,update,delivery}.md
```

Quickstart
----------

STAFF turns Claude into your Chief of Staff; `staff` is the program it runs on: your canon of
traits, roles, plays, and teams as small markdown primitives, and `cast` to put them to work
inside Claude Code sessions.

Install:

    deno install --global -A -n staff jsr:@bandeira-tech/staff/cli

First run:

    staff rig                                               # health: which rig, where data lives (~/Staff, or the nearest staff|.staff tree)
    staff root   # where your data lives — public by default; `mv staff .staff` any time to hide it
    staff add trait skeptical "You don't trust work being presented to you."
    staff list trait                                        # 1 proposal pending
    staff promote trait skeptical                          # proposals are yours to promote to canon
    staff cast trait skeptical -- -p "review the README"   # one cast = one Claude session

Everything is markdown under a URI grammar — readable and grep-able by hand, no server required.
Add `--room <room>` to a cast and agents coordinate live through a cc-chat room (rooms are data).

Pass 2 status (2026-07-02)
--------------------------

Pass 2 ships the program: a `staff` CLI (`add`, `promote`, `list`,
`read`, `cast`, `rig`) that loads a b3nd rig in-process — bundled
FsStore rig by default (`~/Staff`), user-pluggable via `staff rig`.
`add` writes proposals; `promote` is the builder's act; `cast` composes
refs into a brief, records the session, and spawns a Claude Code
session (`--room` writes a cc-chat room URI into the brief — rooms are
data, not integrations). The protocol module covers the full grammar:
`canon/` and `proposal/{…}/{ts}/` buckets, `gates/`, `players/`
(renamed from `cast/`), and player-grouped session leaves.

Install the CLI:

    deno install --global -A -n staff jsr:@bandeira-tech/staff/cli

Serve the rig (browsers / atrium / MCP) with bnd v0.5+:

    bnd node jsr:@bandeira-tech/staff/rig --http --cors '*'
    bnd node jsr:@bandeira-tech/staff/rig --mcp

- Spec: `docs/superpowers/specs/2026-07-02-staff-cli-addons-design.md`
- Plan: `docs/superpowers/plans/2026-07-02-staff-pass-2.md`
- Pass 1: `docs/superpowers/specs/2026-06-29-staff-mvp-design.md`
- Tests: `deno task test`
