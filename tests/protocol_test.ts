import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  formatTs,
  isValidName,
  isValidNonce,
  isValidResource,
  isValidSlug,
  isValidTs,
  logUri,
  mainUri,
  mintNonce,
  parseUri,
  type ParsedUri,
  revisionUri,
  RESERVED_RESOURCES,
  RESOURCES,
  validate,
} from "../src/protocol.ts";

const R = "immutable://open/staff/";

// --- closed sets + validators ---

Deno.test("RESOURCES is the closed MVP set", () => {
  assertEquals([...RESOURCES], ["staff", "traits", "plays", "logs"]);
});

Deno.test("RESERVED_RESOURCES carries positions and teams", () => {
  assertEquals([...RESERVED_RESOURCES], ["positions", "teams"]);
});

Deno.test("isValidResource accepts MVP set, rejects reserved + unknown", () => {
  for (const r of RESOURCES) assertStrictEquals(isValidResource(r), true);
  for (const r of RESERVED_RESOURCES) assertStrictEquals(isValidResource(r), false);
  assertStrictEquals(isValidResource("rooms"), false);
  assertStrictEquals(isValidResource(""), false);
});

Deno.test("isValidName accepts well-formed slugs and rejects garbage", () => {
  assertStrictEquals(isValidName("alice"), true);
  assertStrictEquals(isValidName("a-b-c"), true);
  assertStrictEquals(isValidName("0abc"), true);
  assertStrictEquals(isValidName("Alice"), false);
  assertStrictEquals(isValidName("-bad"), false);
  assertStrictEquals(isValidName(""), false);
  assertStrictEquals(isValidName("a".repeat(49)), false);
});

Deno.test("isValidSlug mirrors isValidName grammar", () => {
  assertStrictEquals(isValidSlug("hello-world"), true);
  assertStrictEquals(isValidSlug("hello/world"), false);
});

Deno.test("isValidTs requires exactly 14 digits", () => {
  assertStrictEquals(isValidTs("20260629000000"), true);
  assertStrictEquals(isValidTs("2026062900000"), false);
  assertStrictEquals(isValidTs("202606290000000"), false);
});

Deno.test("isValidNonce accepts 6-char base32 alphabet", () => {
  assertStrictEquals(isValidNonce("a1b2c3"), true);
  assertStrictEquals(isValidNonce("ABCDEF"), false);
  assertStrictEquals(isValidNonce("abcde"), false);
});

Deno.test("formatTs zero-pads UTC components", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 7, 8, 9));
  assertStrictEquals(formatTs(d), "20260629070809");
});

Deno.test("mintNonce yields 6 chars from the alphabet", () => {
  for (let i = 0; i < 32; i++) {
    const n = mintNonce();
    assertStrictEquals(n.length, 6);
    assertStrictEquals(/^[a-z0-9]{6}$/.test(n), true);
  }
});

// --- mint helpers ---

Deno.test("mainUri builds <root><resource>/<name>/MAIN.md", () => {
  assertStrictEquals(
    mainUri(R, "traits", "newbie"),
    "immutable://open/staff/traits/newbie/MAIN.md",
  );
  assertStrictEquals(
    mainUri(R, "plays", "crazy8s"),
    "immutable://open/staff/plays/crazy8s/MAIN.md",
  );
});

Deno.test("mainUri rejects bad root, resource, or name", () => {
  let threw = false;
  try { mainUri("no-scheme/", "traits", "x"); } catch { threw = true; }
  assertStrictEquals(threw, true);

  threw = false;
  try { mainUri("https://x.example", "traits", "x"); } catch { threw = true; }
  assertStrictEquals(threw, true);

  threw = false;
  try { mainUri(R, "rooms" as unknown as "traits", "x"); } catch { threw = true; }
  assertStrictEquals(threw, true);

  threw = false;
  try { mainUri(R, "traits", "Bad-Name"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

Deno.test("revisionUri builds <root><resource>/<name>/<ts>-<slug>.md", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 12, 0, 0));
  assertStrictEquals(
    revisionUri(R, "traits", "newbie", "edit", d),
    "immutable://open/staff/traits/newbie/20260629120000-edit.md",
  );
});

Deno.test("revisionUri rejects malformed slug", () => {
  let threw = false;
  try { revisionUri(R, "traits", "newbie", "Bad Slug"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

Deno.test("revisionUri without explicit date uses now", () => {
  const out = revisionUri(R, "plays", "triage", "tweak");
  assertStrictEquals(
    /^immutable:\/\/open\/staff\/plays\/triage\/[0-9]{14}-tweak\.md$/.test(out),
    true,
  );
});

Deno.test("logUri lives flat under <root>logs/", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 12, 0, 0));
  assertStrictEquals(
    logUri(R, "captured-trait", d),
    "immutable://open/staff/logs/20260629120000-captured-trait.md",
  );
});

Deno.test("logUri rejects bad slug", () => {
  let threw = false;
  try { logUri(R, ""); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

// --- parseUri + validate ---

Deno.test("parseUri recognizes a MAIN URI", () => {
  const got = parseUri(R, "immutable://open/staff/traits/newbie/MAIN.md");
  assertEquals(got, { kind: "main", resource: "traits", name: "newbie" } satisfies ParsedUri);
});

Deno.test("parseUri recognizes a revision URI", () => {
  const got = parseUri(R, "immutable://open/staff/plays/triage/20260629120000-edit.md");
  assertEquals(got, {
    kind: "revision",
    resource: "plays",
    name: "triage",
    ts: "20260629120000",
    slug: "edit",
  } satisfies ParsedUri);
});

Deno.test("parseUri recognizes a log URI", () => {
  const got = parseUri(R, "immutable://open/staff/logs/20260629120000-captured-trait.md");
  assertEquals(got, {
    kind: "log",
    ts: "20260629120000",
    slug: "captured-trait",
  } satisfies ParsedUri);
});

Deno.test("parseUri returns null for malformed URIs", () => {
  assertEquals(parseUri(R, "immutable://open/staff/rooms/foo/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/Bad/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/main.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/extra/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/notatime-edit.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/positions/foo/MAIN.md"), null);
});

Deno.test("parseUri rejects URIs outside root", () => {
  assertEquals(parseUri(R, "https://elsewhere/traits/foo/MAIN.md"), null);
});

Deno.test("validate throws on malformed; returns void on valid", () => {
  validate(R, "immutable://open/staff/traits/newbie/MAIN.md");
  let threw = false;
  try { validate(R, "immutable://open/staff/rooms/foo/MAIN.md"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

Deno.test("round-trip: every mint helper output parses back", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 0, 0, 0));
  for (const r of RESOURCES) {
    if (r === "logs") continue;
    const m = mainUri(R, r, "x-y");
    assertEquals(parseUri(R, m)?.kind, "main");
    const v = revisionUri(R, r, "x-y", "tweak", d);
    assertEquals(parseUri(R, v)?.kind, "revision");
  }
  const l = logUri(R, "captured", d);
  assertEquals(parseUri(R, l)?.kind, "log");
});
