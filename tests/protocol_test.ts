import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  CARD_RESOURCES,
  formatTs,
  isValidCardResource,
  isValidName,
  isValidNonce,
  isValidResource,
  isValidSessionId,
  isValidSessionLeaf,
  isValidSlug,
  isValidTs,
  mainUri,
  mintNonce,
  mintSessionId,
  parseUri,
  type ParsedUri,
  revisionUri,
  RESERVED_RESOURCES,
  RESOURCES,
  SESSION_LEAVES,
  sessionUri,
  validate,
} from "../src/protocol.ts";

const R = "immutable://open/staff/";

// --- closed sets + validators ---

Deno.test("RESOURCES is the closed MVP set", () => {
  assertEquals([...RESOURCES], ["staff", "traits", "plays", "sessions"]);
});

Deno.test("CARD_RESOURCES drops sessions (different shape)", () => {
  assertEquals([...CARD_RESOURCES], ["staff", "traits", "plays"]);
});

Deno.test("RESERVED_RESOURCES carries positions and teams", () => {
  assertEquals([...RESERVED_RESOURCES], ["positions", "teams"]);
});

Deno.test("SESSION_LEAVES is the closed canonical leaf set", () => {
  assertEquals([...SESSION_LEAVES], ["MAIN", "LEDGER", "REPORT"]);
});

Deno.test("isValidResource accepts MVP set, rejects reserved + unknown", () => {
  for (const r of RESOURCES) assertStrictEquals(isValidResource(r), true);
  for (const r of RESERVED_RESOURCES) assertStrictEquals(isValidResource(r), false);
  assertStrictEquals(isValidResource("logs"), false);
  assertStrictEquals(isValidResource(""), false);
});

Deno.test("isValidCardResource is narrower than isValidResource", () => {
  assertStrictEquals(isValidCardResource("staff"), true);
  assertStrictEquals(isValidCardResource("traits"), true);
  assertStrictEquals(isValidCardResource("plays"), true);
  assertStrictEquals(isValidCardResource("sessions"), false);
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

Deno.test("isValidSessionId matches <ts>-<slug>", () => {
  assertStrictEquals(isValidSessionId("20260629120000-triage"), true);
  assertStrictEquals(isValidSessionId("20260629120000-"), false);
  assertStrictEquals(isValidSessionId("triage-20260629120000"), false);
  assertStrictEquals(isValidSessionId("2026062912000-triage"), false);
  assertStrictEquals(isValidSessionId(""), false);
});

Deno.test("isValidSessionLeaf accepts only the closed set", () => {
  assertStrictEquals(isValidSessionLeaf("MAIN"), true);
  assertStrictEquals(isValidSessionLeaf("LEDGER"), true);
  assertStrictEquals(isValidSessionLeaf("REPORT"), true);
  assertStrictEquals(isValidSessionLeaf("main"), false);
  assertStrictEquals(isValidSessionLeaf("OUTPUT"), false);
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

Deno.test("mintSessionId returns <ts>-<slug>", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 12, 0, 0));
  assertStrictEquals(mintSessionId("triage", d), "20260629120000-triage");
});

Deno.test("mintSessionId rejects bad slug", () => {
  let threw = false;
  try { mintSessionId("Bad Slug"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

// --- mint helpers: card resources ---

Deno.test("mainUri builds <root><card>/<name>/MAIN.md", () => {
  assertStrictEquals(
    mainUri(R, "traits", "newbie"),
    "immutable://open/staff/traits/newbie/MAIN.md",
  );
  assertStrictEquals(
    mainUri(R, "plays", "crazy8s"),
    "immutable://open/staff/plays/crazy8s/MAIN.md",
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

Deno.test("sessionUri builds <root>sessions/<sessionId>/<leaf>.md", () => {
  const sid = "20260629120000-triage";
  assertStrictEquals(
    sessionUri(R, sid, "MAIN"),
    "immutable://open/staff/sessions/20260629120000-triage/MAIN.md",
  );
  assertStrictEquals(
    sessionUri(R, sid, "LEDGER"),
    "immutable://open/staff/sessions/20260629120000-triage/LEDGER.md",
  );
  assertStrictEquals(
    sessionUri(R, sid, "REPORT"),
    "immutable://open/staff/sessions/20260629120000-triage/REPORT.md",
  );
});

Deno.test("sessionUri rejects malformed session id", () => {
  let threw = false;
  try { sessionUri(R, "not-a-session-id", "MAIN"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

Deno.test("sessionUri rejects unknown leaf", () => {
  let threw = false;
  try {
    sessionUri(R, "20260629120000-triage", "OUTPUT" as unknown as "MAIN");
  } catch { threw = true; }
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

Deno.test("parseUri recognizes a session URI for each leaf", () => {
  for (const leaf of SESSION_LEAVES) {
    const uri = `immutable://open/staff/sessions/20260629120000-triage/${leaf}.md`;
    const got = parseUri(R, uri);
    assertEquals(got, {
      kind: "session",
      sessionId: "20260629120000-triage",
      ts: "20260629120000",
      slug: "triage",
      leaf,
    } satisfies ParsedUri);
  }
});

Deno.test("parseUri returns null for malformed URIs", () => {
  assertEquals(parseUri(R, "immutable://open/staff/rooms/foo/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/Bad/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/main.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/extra/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/traits/foo/notatime-edit.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/positions/foo/MAIN.md"), null);
  // legacy logs/ shape no longer recognized
  assertEquals(parseUri(R, "immutable://open/staff/logs/20260629120000-x.md"), null);
  // sessions with bad shape
  assertEquals(parseUri(R, "immutable://open/staff/sessions/triage/MAIN.md"), null);
  assertEquals(parseUri(R, "immutable://open/staff/sessions/20260629120000-triage/OUTPUT.md"), null);
});

Deno.test("parseUri rejects URIs outside root", () => {
  assertEquals(parseUri(R, "https://elsewhere/traits/foo/MAIN.md"), null);
});

Deno.test("validate throws on malformed; returns void on valid", () => {
  validate(R, "immutable://open/staff/traits/newbie/MAIN.md");
  validate(R, "immutable://open/staff/sessions/20260629120000-triage/LEDGER.md");
  let threw = false;
  try { validate(R, "immutable://open/staff/rooms/foo/MAIN.md"); } catch { threw = true; }
  assertStrictEquals(threw, true);
});

Deno.test("round-trip: every mint helper output parses back", () => {
  const d = new Date(Date.UTC(2026, 5, 29, 0, 0, 0));
  for (const r of CARD_RESOURCES) {
    const m = mainUri(R, r, "x-y");
    assertEquals(parseUri(R, m)?.kind, "main");
    const v = revisionUri(R, r, "x-y", "tweak", d);
    assertEquals(parseUri(R, v)?.kind, "revision");
  }
  const sid = mintSessionId("triage", d);
  for (const leaf of SESSION_LEAVES) {
    const s = sessionUri(R, sid, leaf);
    const got = parseUri(R, s);
    assertEquals(got?.kind, "session");
  }
});
