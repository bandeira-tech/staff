import { assertEquals, assertExists, assertStringIncludes, assertThrows } from "@std/assert";
import {
  isValidSlug,
  lintRoleFile,
  listRoles,
  parseRoleFile,
  renderStandingBrief,
  resolveRole,
} from "../src/roles.ts";

const ROOT = await Deno.makeTempDir({ prefix: "cc-chat-roles-" });
const projectRoot = `${ROOT}/proj`;
const pluginRoot = `${ROOT}/plug`;

async function write(path: string, content: string): Promise<void> {
  await Deno.mkdir(path.substring(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, content);
}

const QA_PLUGIN = `---
slug: qa
summary: Acceptance gates + evidence.
sourced_from:
  - 20260625203504-viral-mvp
version: 2
updated: 2026-06-26T00:00:00Z
---

## When to summon

For any buildable deliverable.

## Habits

- Post one consolidated msg per phase.
`;

const QA_LOCAL = `---
slug: qa
summary: Local override of qa.
version: 1
---

## When to summon

Project-local override variant.
`;

await write(`${pluginRoot}/skills/cc-chat/roles/qa.md`, QA_PLUGIN);
await write(`${projectRoot}/.claude/cc-chat/roles/qa.md`, QA_LOCAL);

Deno.test("isValidSlug accepts canonical shapes, rejects garbage", () => {
  assertEquals(isValidSlug("qa"), true);
  assertEquals(isValidSlug("package-rep"), true);
  assertEquals(isValidSlug("a"), true);
  assertEquals(isValidSlug(""), false);
  assertEquals(isValidSlug("Foo"), false);
  assertEquals(isValidSlug("-foo"), false);
  assertEquals(isValidSlug("foo/bar"), false);
});

Deno.test("parseRoleFile reads required + optional frontmatter", () => {
  const file = parseRoleFile(QA_PLUGIN, "fake/path");
  assertEquals(file.frontmatter.slug, "qa");
  assertStringIncludes(file.frontmatter.summary, "Acceptance gates");
  assertEquals(file.frontmatter.version, 2);
  assertEquals(file.frontmatter.sourced_from, ["20260625203504-viral-mvp"]);
  assertStringIncludes(file.body, "## When to summon");
});

Deno.test("parseRoleFile rejects unknown frontmatter keys", () => {
  const bad = `---
slug: qa
summary: x
bogus: nope
---
body
`;
  assertThrows(() => parseRoleFile(bad, "fake"), Error, "unknown frontmatter key");
});

Deno.test("parseRoleFile rejects missing slug or summary", () => {
  const noSummary = `---
slug: qa
---
body
`;
  assertThrows(() => parseRoleFile(noSummary, "fake"), Error, "summary");

  const noSlug = `---
summary: x
---
body
`;
  assertThrows(() => parseRoleFile(noSlug, "fake"), Error, "slug");
});

Deno.test("parseRoleFile rejects invalid status value", () => {
  const bad = `---
slug: qa
summary: x
status: zombie
---
body
`;
  assertThrows(() => parseRoleFile(bad, "fake"), Error, "active");
});

Deno.test("lintRoleFile flags filename mismatch", () => {
  const file = parseRoleFile(QA_PLUGIN, "qa.md");
  const issues = lintRoleFile(file, "techlead");
  assertEquals(issues.some((i) => i.kind === "error" && i.message.includes("does not match filename")), true);
});

Deno.test("lintRoleFile flags H1 in body", () => {
  const raw = `---
slug: qa
summary: x
---

# Bad H1

body
`;
  const file = parseRoleFile(raw, "qa.md");
  const issues = lintRoleFile(file, "qa");
  assertEquals(issues.some((i) => i.kind === "error" && i.message.includes("H1")), true);
});

Deno.test("lintRoleFile warns on oversize body", () => {
  const big = "x".repeat(5000);
  const raw = `---
slug: qa
summary: x
---
${big}
`;
  const file = parseRoleFile(raw, "qa.md");
  const issues = lintRoleFile(file, "qa");
  assertEquals(issues.some((i) => i.kind === "warn" && i.message.includes("4000")), true);
});

Deno.test("lintRoleFile flags oversize summary", () => {
  const raw = `---
slug: qa
summary: ${"x".repeat(250)}
---
body
`;
  const file = parseRoleFile(raw, "qa.md");
  const issues = lintRoleFile(file, "qa");
  assertEquals(issues.some((i) => i.kind === "error" && i.message.includes("max 200")), true);
});

Deno.test("resolveRole prefers project-local over plugin", async () => {
  const resolved = await resolveRole("qa", { projectRoot, pluginRoot });
  assertExists(resolved);
  assertEquals(resolved.source, "local");
  assertStringIncludes(resolved.file.frontmatter.summary, "Local override");
});

Deno.test("resolveRole falls back to plugin when no local", async () => {
  const tmp = await Deno.makeTempDir();
  const resolved = await resolveRole("qa", { projectRoot: tmp, pluginRoot });
  assertExists(resolved);
  assertEquals(resolved.source, "plugin");
  assertEquals(resolved.file.frontmatter.version, 2);
});

Deno.test("resolveRole returns null for unknown slug", async () => {
  const resolved = await resolveRole("unknown-role-xyz", { projectRoot, pluginRoot });
  assertEquals(resolved, null);
});

Deno.test("resolveRole rejects invalid slug", async () => {
  let err: Error | null = null;
  try {
    await resolveRole("../etc/passwd", { projectRoot, pluginRoot });
  } catch (e) {
    err = e as Error;
  }
  assertExists(err);
  assertStringIncludes(err.message, "invalid slug");
});

Deno.test("listRoles dedupes by slug, local wins", async () => {
  const roles = await listRoles({ projectRoot, pluginRoot });
  assertEquals(roles.length, 1);
  assertEquals(roles[0].source, "local");
});

Deno.test("renderStandingBrief returns empty string for null", () => {
  assertEquals(renderStandingBrief(null), "");
});

Deno.test("renderStandingBrief includes path + version + body", () => {
  const file = parseRoleFile(QA_PLUGIN, "/abs/qa.md");
  const out = renderStandingBrief({ file, source: "plugin" });
  assertStringIncludes(out, "Standing role brief");
  assertStringIncludes(out, "/abs/qa.md");
  assertStringIncludes(out, "@v2");
  assertStringIncludes(out, "## When to summon");
});

Deno.test("renderStandingBrief flags retired-with-note status", () => {
  const raw = `---
slug: old
summary: x
status: retired-with-note
---

body content
`;
  const file = parseRoleFile(raw, "/abs/old.md");
  const out = renderStandingBrief({ file, source: "plugin" });
  assertStringIncludes(out, "retired-with-note");
});
