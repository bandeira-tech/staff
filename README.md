STAFF by BANDEIRA.TECH
======================

Staff turns Claude into Chief of Staff, to recruit and instruct other agents
to turn vision into validated reality.

Start working with zero setup, and grow your own system of Traits, Plays, Teams
and Roles as you go.

All your data locally, and easily replicated wherever you need it.

```
/{your choice}
    /staff/{name}/MAIN.md
    /traits/{name}/MAIN.md
    /positions/{name}/MAIN.md
    /plays/{name}/MAIN.md
    /teams/{name}/MAIN.md
    /sessions/{ts}-{session}/{MAIN,LEDGER,REPORT}.md
```

Pass 1 status (2026-06-29)
--------------------------

This pass ships the URI convention (tested), a prose-only Claude Code
plugin skeleton (no MCP rig wired yet), and a single-page install site
for `staff.bandeira.tech`. No bundled data; the framework is the
product.

The protocol module implements the closed MVP resource set
`{ staff, traits, plays, sessions }` per the spec at
`docs/superpowers/specs/2026-06-29-staff-mvp-design.md`. Sessions
carry a three-leaf shape (`MAIN`, `LEDGER`, `REPORT`) under a
time-prefixed id `<ts>-<session>`. `positions` and `teams` are
reserved in the grammar.

Pass 2 will: wire the b3nd MCP rig
(`plugin/.claude-plugin/staff.rig.ts`), add the web viewer, and grow
`positions/` and `teams/` helpers.

- Spec: `docs/superpowers/specs/2026-06-29-staff-mvp-design.md`
- Plan: `docs/superpowers/plans/2026-06-29-staff-mvp.md`
- Site: `site/index.html` (opens with `open site/index.html`)
- Tests: `deno task test` — 32 passing.
