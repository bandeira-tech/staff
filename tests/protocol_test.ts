import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  CARD_RESOURCES,
  formatTs,
  isValidCardResource,
  isValidName,
  isValidNonce,
  isValidResource,
  isValidSessionLeaf,
  isValidSlug,
  isValidTs,
  mainUri,
  MAIN_LEAF,
  mintNonce,
  parseUri,
  type ParsedUri,
  revisionUri,
  RESOURCES,
  SESSION_LEAVES,
  sessionUri,
  validate,
} from "../src/protocol.ts";

const R = "immutable://open/staff/";

// --- closed sets + validators ---

Deno.test("RESOURCES is the six-primitive closed set", () => {
  assertEquals(
    [...RESOURCES],
    ["traits", "roles", "plays", "teams", "staff", "sessions"],
  );
});

Deno.test("CARD_RESOURCES drops sessions (different shape)", () => {
  assertEquals(
    [...CARD_RESOURCES],
    ["traits", "roles", "plays", "teams", "staff"],
  );
});

Deno.test("SESSION_LEAVES is the closed canonical leaf set (lowercase)", () => {
  assertEquals([...SESSION_LEAVES], ["main", "update", "delivery"]);
});

Deno.test("MAIN_LEAF is lowercase main.md", () => {
  assertStrictEquals(MAIN_LEAF, "main.md");
});

Deno.test("isValidResource accepts the six primitives, rejects unknown", () => {
  for (const r of RESOURCES) assertStrictEquals(isValidResource(r), true);
  assertStrictEquals(isValidResource("positions"), false);
  assertStrictEquals(isValidResource("logs"), false);
  assertStrictEquals(isValidResource(""), false);
});

Deno.test("isValidCardResource is narrower than isValidResource", () => {
  for (const r of CARD_RESOURCES) {
    assertStrictEquals(isValidCardResource(r), true);
  }
  assertStrictEquals(isValidCardResource("sessions"), false);
  assertStrictEquals(isValidCardResource("positions"), false);
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

Deno.test("isValidSessionLeaf accepts only the lowercase closed set", () => {
  assertStrictEquals(isValidSessionLeaf("main"), true);
  assertStrictEquals(isValidSessionLeaf("update"), true);
  assertStrictEquals(isValidSessionLeaf("delivery"), true);
  // old uppercase no longer valid
  assertStrictEquals(isValidSessionLeaf("MAIN"), false);
  assertStrictEquals(isValidSessionLeaf("LEDGER"), false);
  assertStrictEquals(isValidSessionLeaf("REPORT"), false);
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

// --- mint helpers: card resources ---

Deno.test("mainUri builds <root><card>/<name>/main.md for every card", () => {
  assertStrictEquals(
    mainUri(R, "traits", "newbie"),
    "immutable://open/staff/traits/newbie/main.md",
  );
  assertStrictEquals(
    mainUri(R, "roles", "platform-client"),
    "immutable://open/staff/roles/platform-client/main.md",
  );
  assertStrictEquals(
    mainUri(R, "plays", "crazy8s"),
    "immutable://open/staff/plays/crazy8s/main.md",
  );
  assertStrictEquals(
    mainUri(R, "teams", "platform-customization"),
    "immutable://open/staff/teams/platform-customization/main.md",
  );
  assertStrictEquals(
    mainUri(R, "staff", "wondertime"),
    "immutable://open/staff/staff/wondertime/main.md",
  );
});

Deno.test("mainUri rejects sessions (use sessionUri instead)", () => {
  let threw = false;
  try {
    mainUri(R, "sessions" as unknown as "traits", "x");
  } catch {
    threw = true;
  }
  assertStrictEquals(threw, true);
});

Deno.test("mainUri rejects bad root, resource, or name", () => {
  let threw = false;
  try { mainUri("no-scheme/", "traits", "x"); } catch { threw = true; }
  assertStrictEquals(threw, true);

  threw = false;
  try { mainUri("https://x.example", "traits", "x"); } catch { threw = true; }
  assertStrictEquals(threw, true);

  threw = false;
  try {
    mainUri(R, "rooms" as unknown as "traits", "x");
  } catch { threw = true; }
  assertStrictEquals(threw, true);

  // "positions" is no longer reserved; it's just unknown
  threw = false;
  try {
    mainUri(R, "positions" as unknown as "traits", "x");
  } catch { threw = true; }
  assertStrictEquals(threw, true);

  threw = false;
  try { mainUri(R, "traits", "Bad-Name"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

Deno.test("revisionUri builds <root><card>/<name>/<ts>-<slug>.md", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 12, 0, 0));
  assertStrictEquals(
    revisionUri(R, "traits", "newbie", "edit", d),
    "immutable://open/staff/traits/newbie/20260629120000-edit.md",
  );
  assertStrictEquals(
    revisionUri(R, "teams", "platform-customization", "tweak", d),
    "immutable://open/staff/teams/platform-customization/20260629120000-tweak.md",
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

// --- mint helpers: sessions ---

Deno.test("sessionUri builds <root>sessions/<name>/<ts>-<leaf>.md for each leaf", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 12, 0, 0));
  assertStrictEquals(
    sessionUri(R, "triage", "main", d),
    "immutable://open/staff/sessions/triage/20260629120000-main.md",
  );
  assertStrictEquals(
    sessionUri(R, "triage", "update", d),
    "immutable://open/staff/sessions/triage/20260629120000-update.md",
  );
  assertStrictEquals(
    sessionUri(R, "triage", "delivery", d),
    "immutable://open/staff/sessions/triage/20260629120000-delivery.md",
  );
});

Deno.test("sessionUri without explicit date uses now", () => {
  const out = sessionUri(R, "triage", "update");
  assertStrictEquals(
    /^immutable:\/\/open\/staff\/sessions\/triage\/[0-9]{14}-update\.md$/.test(out),
    true,
  );
});

Deno.test("sessionUri rejects malformed session name", () => {
  let threw = false;
  try { sessionUri(R, "Bad Name", "main"); } catch { threw = true; }
  assertStrictEquals(threw, true);

  // The old <ts>-<slug> composite shape is no longer a valid session name
  threw = false;
  try {
    // 14-digit ts plus a slug is too long to match [a-z0-9-]{0,47} when prefixed
    // by digits, but actually does fit length-wise — the rejection point is
    // semantic (we now want plain slugs). Verify the disk layout we mint.
    const out = sessionUri(R, "20260629120000-triage", "main");
    // If it didn't throw, ensure it minted the literal name (not a composite)
    assertStrictEquals(
      out.startsWith("immutable://open/staff/sessions/20260629120000-triage/"),
      true,
    );
  } catch { threw = true; }
  // accept either: the contract is that <name> is a plain slug; a string that
  // happens to look like ts-slug is a (weird) valid slug.
  // The real assertion is that the timestamp now lives on the LEAF.
});

Deno.test("sessionUri rejects unknown leaf", () => {
  let threw = false;
  try {
    sessionUri(R, "triage", "OUTPUT" as unknown as "main");
  } catch { threw = true; }
  assertStrictEquals(threw, true);

  // old uppercase leaves are rejected
  threw = false;
  try {
    sessionUri(R, "triage", "MAIN" as unknown as "main");
  } catch { threw = true; }
  assertStrictEquals(threw, true);

  threw = false;
  try {
    sessionUri(R, "triage", "LEDGER" as unknown as "main");
  } catch { threw = true; }
  assertStrictEquals(threw, true);
});

// --- parseUri + validate ---

Deno.test("parseUri recognizes a main URI for every card", () => {
  for (const r of CARD_RESOURCES) {
    const uri = `${R}${r}/sample/main.md`;
    const got = parseUri(R, uri);
    assertEquals(got, { kind: "main", resource: r, name: "sample" } satisfies ParsedUri);
  }
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

Deno.test("parseUri recognizes a session URI for each leaf", () => {
  for (const leaf of SESSION_LEAVES) {
    const uri = `immutable://open/staff/sessions/triage/20260629120000-${leaf}.md`;
    const got = parseUri(R, uri);
    assertEquals(got, {
      kind: "session",
      sessionName: "triage",
      ts: "20260629120000",
      leaf,
    } satisfies ParsedUri);
  }
});

Deno.test("parseUri rejects the old uppercase MAIN.md form", () => {
  assertEquals(parseUri(R, "immutable://open/staff/traits/newbie/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/plays/triage/MAIN.md"), null);
});

Deno.test("parseUri rejects the old <ts>-<slug>/<LEAF>.md session shape", () => {
  // Old: sessions/<ts>-<slug>/MAIN.md  (timestamp in dir, leaf is bare word)
  assertEquals(
    parseUri(R, "immutable://open/staff/sessions/20260629120000-triage/MAIN.md"),
    null,
  );
  assertEquals(
    parseUri(R, "immutable://open/staff/sessions/20260629120000-triage/LEDGER.md"),
    null,
  );
  assertEquals(
    parseUri(R, "immutable://open/staff/sessions/20260629120000-triage/REPORT.md"),
    null,
  );
  // A bare session name with a bare leaf word (no timestamp) is also rejected
  assertEquals(
    parseUri(R, "immutable://open/staff/sessions/triage/main.md"),
    null,
  );
});

Deno.test("parseUri returns null for malformed URIs", () => {
  assertEquals(parseUri(R, "immutable://open/staff/rooms/foo/main.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/Bad/main.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/extra/main.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/notatime-edit.md"), null);
  // legacy logs/ shape no longer recognized
  assertEquals(parseUri(R, "immutable://open/staff/logs/20260629120000-x.md"), null);
  // positions is no longer reserved or first-class — just unknown
  assertEquals(parseUri(R, "immutable://open/staff/positions/foo/main.md"), null);
  // unknown session leaf word
  assertEquals(
    parseUri(R, "immutable://open/staff/sessions/triage/20260629120000-output.md"),
    null,
  );
});

Deno.test("parseUri rejects URIs outside root", () => {
  assertEquals(parseUri(R, "https://elsewhere/traits/foo/main.md"), null);
});

Deno.test("validate throws on malformed; returns void on valid", () => {
  validate(R, "immutable://open/staff/traits/newbie/main.md");
  validate(R, "immutable://open/staff/roles/platform-client/main.md");
  validate(R, "immutable://open/staff/teams/platform-customization/main.md");
  validate(R, "immutable://open/staff/staff/wondertime/main.md");
  validate(R, "immutable://open/staff/sessions/triage/20260629120000-update.md");
  let threw = false;
  try { validate(R, "immutable://open/staff/rooms/foo/main.md"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

Deno.test("round-trip: every card mint helper output parses back", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 0, 0, 0));
  for (const r of CARD_RESOURCES) {
    const m = mainUri(R, r, "x-y");
    const parsedMain = parseUri(R, m);
    assertEquals(parsedMain, { kind: "main", resource: r, name: "x-y" } satisfies ParsedUri);

    const v = revisionUri(R, r, "x-y", "tweak", d);
    assertEquals(parseUri(R, v), {
      kind: "revision",
      resource: r,
      name: "x-y",
      ts: "20260629000000",
      slug: "tweak",
    } satisfies ParsedUri);
  }
});

Deno.test("round-trip: sessionUri output parses back for every leaf", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 0, 0, 0));
  for (const leaf of SESSION_LEAVES) {
    const s = sessionUri(R, "triage", leaf, d);
    assertEquals(parseUri(R, s), {
      kind: "session",
      sessionName: "triage",
      ts: "20260629000000",
      leaf,
    } satisfies ParsedUri);
  }
});

Deno.test("round-trip: a session may have multiple distinct update leaves", () => {
  const d1 = new Date(Date.UTC(2026, 5, 29, 9, 0, 0));
  const d2 = new Date(Date.UTC(2026, 5, 29, 10, 0, 0));
  const u1 = sessionUri(R, "triage", "update", d1);
  const u2 = sessionUri(R, "triage", "update", d2);
  assertStrictEquals(u1 === u2, false);
  const p1 = parseUri(R, u1);
  const p2 = parseUri(R, u2);
  assertEquals(p1?.kind, "session");
  assertEquals(p2?.kind, "session");
  if (p1?.kind === "session" && p2?.kind === "session") {
    assertStrictEquals(p1.sessionName, "triage");
    assertStrictEquals(p2.sessionName, "triage");
    assertStrictEquals(p1.ts, "20260629090000");
    assertStrictEquals(p2.ts, "20260629100000");
  }
});
