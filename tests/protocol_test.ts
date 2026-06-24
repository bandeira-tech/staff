import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  TYPES,
  MANAGER_ONLY_TYPES,
  MANAGER_NAME,
  META_LEAF,
  isValidName,
  isValidSlug,
  isValidRoom,
  formatTs,
  mintNonce,
  mintRoom,
  metaUri,
  joinUri,
  msgUri,
  pauseUri,
  resumeUri,
  endUri,
  mentionUri,
  outputUri,
  parseUri,
  validate,
} from "../src/protocol.ts";

const ROOT = "immutable://open/cc-chat/";

Deno.test("TYPES is the closed set", () => {
  assertEquals([...TYPES], ["join","msg","pause","resume","end","mention","output"]);
});

Deno.test("MANAGER_ONLY_TYPES contains pause/resume/output", () => {
  assertEquals([...MANAGER_ONLY_TYPES], ["pause","resume","output"]);
});

Deno.test("MANAGER_NAME is 'manager'", () => {
  assertEquals(MANAGER_NAME, "manager");
});

Deno.test("META_LEAF is 'meta.md'", () => {
  assertEquals(META_LEAF, "meta.md");
});

Deno.test("isValidName accepts simple names", () => {
  assert(isValidName("researcher"));
  assert(isValidName("a"));
  assert(isValidName("src-auth"));
  assert(isValidName("a" + "b".repeat(31)));
});

Deno.test("isValidName rejects bad shapes", () => {
  assert(!isValidName(""));
  assert(!isValidName("Researcher"));
  assert(!isValidName("-leading"));
  assert(!isValidName("has spaces"));
  assert(!isValidName("a".repeat(33)));
});

Deno.test("isValidSlug accepts up to 48 chars", () => {
  assert(isValidSlug("a"));
  assert(isValidSlug("design-review"));
  assert(isValidSlug("a" + "b".repeat(47)));
  assert(!isValidSlug("a" + "b".repeat(48)));
  assert(!isValidSlug("-leading"));
});

Deno.test("isValidRoom is <ts>-<slug>", () => {
  assert(isValidRoom("20260624120000-design-review"));
  assert(!isValidRoom("design-review"));
  assert(!isValidRoom("2026-design-review"));
});

Deno.test("formatTs formats UTC as 14 digits", () => {
  const ts = formatTs(new Date(Date.UTC(2026, 5, 24, 12, 0, 0)));
  assertEquals(ts, "20260624120000");
});

Deno.test("mintNonce returns 6 base32 chars", () => {
  const n = mintNonce();
  assertEquals(n.length, 6);
  assert(/^[a-z0-9]{6}$/.test(n));
});

Deno.test("mintRoom builds <ts>-<slug>", () => {
  const room = mintRoom("design-review", new Date(Date.UTC(2026, 5, 24, 12, 0, 0)));
  assertEquals(room, "20260624120000-design-review");
});

Deno.test("metaUri is <root>/<room>/meta.md", () => {
  const u = metaUri(ROOT, "20260624120000-design-review");
  assertEquals(u, "immutable://open/cc-chat/20260624120000-design-review/meta.md");
});

Deno.test("joinUri shape", () => {
  const u = joinUri(ROOT, "20260624120000-r", "src-auth", new Date(Date.UTC(2026, 5, 24, 12, 0, 5)));
  assert(u.startsWith("immutable://open/cc-chat/20260624120000-r/src-auth/join/20260624120005-"));
  assert(u.endsWith(".json"));
});

Deno.test("msgUri shape includes slug", () => {
  const u = msgUri(ROOT, "20260624120000-r", "src-auth", "starting-x", new Date(Date.UTC(2026, 5, 24, 12, 0, 5)));
  assert(u.startsWith("immutable://open/cc-chat/20260624120000-r/src-auth/msg/20260624120005-"));
  assert(u.includes("starting-x"));
  assert(u.endsWith(".md"));
});

Deno.test("pauseUri pins to manager", () => {
  const u = pauseUri(ROOT, "20260624120000-r", new Date(Date.UTC(2026, 5, 24, 12, 0, 5)));
  assert(u.includes("/manager/pause/"));
});

Deno.test("resumeUri pins to manager", () => {
  const u = resumeUri(ROOT, "20260624120000-r");
  assert(u.includes("/manager/resume/"));
});

Deno.test("endUri carries who", () => {
  const u = endUri(ROOT, "20260624120000-r", "src-auth");
  assert(u.includes("/src-auth/end/"));
});

Deno.test("mentionUri carries from and target", () => {
  const u = mentionUri(ROOT, "20260624120000-r", "src-auth", "src-db", "schema-question");
  assert(u.includes("/src-auth/mention/src-db/"));
  assert(u.includes("schema-question"));
});

Deno.test("outputUri pins to manager", () => {
  const u = outputUri(ROOT, "20260624120000-r", "deliverable");
  assert(u.includes("/manager/output/"));
});

Deno.test("parseUri on meta", () => {
  const u = metaUri(ROOT, "20260624120000-r");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "meta");
  assertEquals(p?.room, "20260624120000-r");
});

Deno.test("parseUri on join", () => {
  const u = joinUri(ROOT, "20260624120000-r", "src-auth");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "join");
  assertEquals(p?.room, "20260624120000-r");
  if (p && "who" in p) assertEquals(p.who, "src-auth");
});

Deno.test("parseUri on msg", () => {
  const u = msgUri(ROOT, "20260624120000-r", "src-auth", "starting");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "msg");
  if (p && "who" in p) assertEquals(p.who, "src-auth");
  if (p && "slug" in p) assertEquals(p.slug, "starting");
});

Deno.test("parseUri on mention", () => {
  const u = mentionUri(ROOT, "20260624120000-r", "src-auth", "src-db", "q");
  const p = parseUri(ROOT, u);
  assertEquals(p?.type, "mention");
  if (p && "who" in p) assertEquals(p.who, "src-auth");
  if (p && "target" in p) assertEquals(p.target, "src-db");
});

Deno.test("parseUri rejects URIs not under root", () => {
  assertEquals(parseUri(ROOT, "other://x/y/z"), null);
});

Deno.test("parseUri rejects unknown types", () => {
  const ts = formatTs(new Date());
  const u = `${ROOT}20260624120000-r/src-auth/badtype/${ts}-abc123.md`;
  assertEquals(parseUri(ROOT, u), null);
});

Deno.test("validate accepts well-formed msg", () => {
  const u = msgUri(ROOT, "20260624120000-r", "src-auth", "x");
  validate(ROOT, u);
});

Deno.test("validate rejects participant-minted pause", () => {
  // hand-craft a pause URI under a non-manager name and confirm it throws
  const ts = formatTs(new Date());
  const nonce = mintNonce();
  const bad = `${ROOT}20260624120000-r/src-auth/pause/${ts}-${nonce}.md`;
  assertThrows(() => validate(ROOT, bad), Error, "manager-only");
});

Deno.test("validate rejects unknown type", () => {
  const ts = formatTs(new Date());
  const nonce = mintNonce();
  const bad = `${ROOT}20260624120000-r/src-auth/whatever/${ts}-${nonce}.md`;
  assertThrows(() => validate(ROOT, bad), Error);
});
