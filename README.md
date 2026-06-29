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

Pass 1 status (2026-06-29)
--------------------------

This pass ships the URI convention (tested), a prose-only Claude Code
plugin skeleton (no MCP rig wired yet), and a single-page install site
for `staff.bandeira.tech`. No bundled data; the framework is the
product.

The protocol module implements the six STAFF primitives — `traits`,
`roles`, `plays`, `teams`, `staff`, `sessions` — all first-class.
Card primitives live at `<root><card>/<name>/main.md` (lowercase
leaf). Sessions live at `<root>sessions/<name>/<ts>-<leaf>.md` where
`<leaf>` is one of `main`, `update`, `delivery`. Each session may
have many updates and one or more deliveries; the timestamp lives on
the leaf, not on the directory.

Pass 2 will: wire the b3nd MCP rig
(`plugin/.claude-plugin/staff.rig.ts`), add the web viewer, and
settle the active-session tracking design.

- Spec: `docs/superpowers/specs/2026-06-29-staff-mvp-design.md`
- Plan: `docs/superpowers/plans/2026-06-29-staff-mvp.md`
- Site: `site/index.html` (opens with `open site/index.html`)
- Tests: `deno task test` — 34 passing.
