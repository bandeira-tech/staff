import { assertEquals, assertStringIncludes } from "@std/assert";
import { parseRoleFile } from "../src/roles.ts";
import {
  buildAcceptedBody,
  type ParticipantRecord,
  proposalPath,
  shouldSkipAutoRetro,
} from "../src/retro.ts";

const ROOM = "20260626220134-role-growth";

function fakeResolved(raw: string, path: string) {
  return { file: parseRoleFile(raw, path), source: "plugin" as const };
}

const QA_V2_NOT_YET = `---
slug: qa
summary: x
sourced_from:
  - 20260625203504-viral-mvp
version: 2
---
body
`;

const QA_V3_ALREADY = `---
slug: qa
summary: x
sourced_from:
  - 20260625203504-viral-mvp
  - 20260626220134-role-growth
version: 3
---
body
`;

const QA_V2_WITH_ANNOTATION = `---
slug: qa
summary: x
sourced_from:
  - 20260626220134-role-growth (this room's qa is currently active)
version: 2
---
body
`;

Deno.test("shouldSkipAutoRetro: empty participants → don't skip", () => {
  const { skip } = shouldSkipAutoRetro(ROOM, []);
  assertEquals(skip, false);
});

Deno.test("shouldSkipAutoRetro: any participant off-the-cuff → don't skip", () => {
  const ps: ParticipantRecord[] = [
    { name: "stranger", roleFile: null },
  ];
  const { skip, reason } = shouldSkipAutoRetro(ROOM, ps);
  assertEquals(skip, false);
  assertStringIncludes(reason, "may propose seeds");
});

Deno.test("shouldSkipAutoRetro: version not yet bumped for this room → don't skip", () => {
  const ps: ParticipantRecord[] = [
    { name: "qa", roleFile: fakeResolved(QA_V2_NOT_YET, "/fake/qa.md") },
  ];
  const { skip, reason } = shouldSkipAutoRetro(ROOM, ps);
  assertEquals(skip, false);
  assertStringIncludes(reason, "has not absorbed");
});

Deno.test("shouldSkipAutoRetro: all roles absorbed → skip", () => {
  const ps: ParticipantRecord[] = [
    { name: "qa", roleFile: fakeResolved(QA_V3_ALREADY, "/fake/qa.md") },
  ];
  const { skip, reason } = shouldSkipAutoRetro(ROOM, ps);
  assertEquals(skip, true);
  assertStringIncludes(reason, "skipping retro");
});

Deno.test("shouldSkipAutoRetro: tolerates annotated sourced_from entry", () => {
  const ps: ParticipantRecord[] = [
    { name: "qa", roleFile: fakeResolved(QA_V2_WITH_ANNOTATION, "/fake/qa.md") },
  ];
  // version=2, occurrences=1; 2 > 1 → skip
  const { skip } = shouldSkipAutoRetro(ROOM, ps);
  assertEquals(skip, true);
});

Deno.test("proposalPath builds the path under .cc-chat/<room>/retro/", () => {
  assertEquals(
    proposalPath("/proj", "20260626220134-role-growth", "qa"),
    "/proj/.cc-chat/20260626220134-role-growth/retro/qa.proposed.md",
  );
});

Deno.test("buildAcceptedBody bumps version, sets updated, appends sourced_from", () => {
  const proposed = `---
slug: qa
summary: New summary
sourced_from:
  - 20260625203504-viral-mvp
version: 2
updated: 2026-06-26T00:00:00Z
---

## When to summon

new body
`;
  const out = buildAcceptedBody({
    proposedRaw: proposed,
    targetPath: "/fake/qa.md",
    roomSlug: ROOM,
    now: "2026-06-27T00:00:00Z",
  });
  const parsed = parseRoleFile(out, "/fake/qa.md");
  assertEquals(parsed.frontmatter.version, 3);
  assertEquals(parsed.frontmatter.updated, "2026-06-27T00:00:00Z");
  assertEquals(parsed.frontmatter.sourced_from, [
    "20260625203504-viral-mvp",
    ROOM,
  ]);
  assertStringIncludes(parsed.body, "new body");
});

Deno.test("buildAcceptedBody does not duplicate sourced_from entry", () => {
  const proposed = `---
slug: qa
summary: x
sourced_from:
  - 20260626220134-role-growth
version: 5
---
body
`;
  const out = buildAcceptedBody({
    proposedRaw: proposed,
    targetPath: "/fake/qa.md",
    roomSlug: ROOM,
    now: "2026-06-27T00:00:00Z",
  });
  const parsed = parseRoleFile(out, "/fake/qa.md");
  assertEquals(parsed.frontmatter.sourced_from, [ROOM]);
  assertEquals(parsed.frontmatter.version, 6);
});

Deno.test("buildAcceptedBody preserves status field", () => {
  const proposed = `---
slug: product
summary: x
status: retired-with-note
version: 1
---
body
`;
  const out = buildAcceptedBody({
    proposedRaw: proposed,
    targetPath: "/fake/product.md",
    roomSlug: ROOM,
    now: "2026-06-27T00:00:00Z",
  });
  const parsed = parseRoleFile(out, "/fake/product.md");
  assertEquals(parsed.frontmatter.status, "retired-with-note");
  assertEquals(parsed.frontmatter.version, 2);
});
