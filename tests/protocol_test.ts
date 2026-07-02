import {
  assertEquals,
  assertThrows,
} from "@std/assert";
import {
  canonUri,
  formatTs,
  isValidKind,
  isValidName,
  isValidTs,
  KIND_ALIASES,
  KINDS,
  mintNonce,
  proposalUri,
  SESSION_LEAVES,
  sessionAssetUri,
  sessionGateUri,
  sessionLeafUri,
} from "../src/protocol.ts";

const ROOT = "immutable://open/staff/";
const D = new Date(Date.UTC(2026, 6, 2, 9, 30, 0)); // 20260702093000

Deno.test("KINDS is the closed five-kind card set", () => {
  assertEquals([...KINDS], ["traits", "roles", "plays", "teams", "staff"]);
});

Deno.test("KIND_ALIASES maps singular and plural to plural", () => {
  assertEquals(KIND_ALIASES["trait"], "traits");
  assertEquals(KIND_ALIASES["traits"], "traits");
  assertEquals(KIND_ALIASES["staff"], "staff");
  assertEquals(KIND_ALIASES["team"], "teams");
  assertEquals(KIND_ALIASES["nope"], undefined);
});

Deno.test("validators", () => {
  assertEquals(isValidKind("traits"), true);
  assertEquals(isValidKind("trait"), false); // plural only in the tree
  assertEquals(isValidName("skeptical"), true);
  assertEquals(isValidName("Skeptical"), false);
  assertEquals(isValidName("-bad"), false);
  assertEquals(isValidTs("20260702093000"), true);
  assertEquals(isValidTs("2026"), false);
});

Deno.test("formatTs and mintNonce keep pass-1 behavior", () => {
  assertEquals(formatTs(D), "20260702093000");
  assertEquals(/^[a-z0-9]{6}$/.test(mintNonce()), true);
});

Deno.test("canonUri: main is the default leaf", () => {
  assertEquals(
    canonUri(ROOT, "traits", "skeptical"),
    "immutable://open/staff/canon/traits/skeptical/main.md",
  );
});

Deno.test("canonUri: gate / player-ref / player-gate leaves", () => {
  assertEquals(
    canonUri(ROOT, "traits", "skeptical", { type: "gate", gate: "no-empty-promises" }),
    "immutable://open/staff/canon/traits/skeptical/gates/no-empty-promises.md",
  );
  assertEquals(
    canonUri(ROOT, "teams", "platform", { type: "player-ref", player: "lead-qa" }),
    "immutable://open/staff/canon/teams/platform/players/lead-qa/role.ref",
  );
  assertEquals(
    canonUri(ROOT, "teams", "platform", {
      type: "player-gate",
      player: "lead-qa",
      gate: "coverage",
    }),
    "immutable://open/staff/canon/teams/platform/players/lead-qa/gates/coverage.md",
  );
});

Deno.test("proposalUri: timestamped subtree", () => {
  assertEquals(
    proposalUri(ROOT, "plays", "bug-triage", "20260702093000"),
    "immutable://open/staff/proposal/plays/bug-triage/20260702093000/main.md",
  );
  assertEquals(
    proposalUri(ROOT, "plays", "bug-triage", "20260702093000", {
      type: "gate",
      gate: "repro-first",
    }),
    "immutable://open/staff/proposal/plays/bug-triage/20260702093000/gates/repro-first.md",
  );
});

Deno.test("mint helpers throw on bad segments", () => {
  assertThrows(() => canonUri("no-scheme/", "traits", "x"));
  assertThrows(() => canonUri(ROOT, "nope" as never, "x"));
  assertThrows(() => canonUri(ROOT, "traits", "Bad Name"));
  assertThrows(() => proposalUri(ROOT, "traits", "x", "2026"));
  assertThrows(() =>
    canonUri(ROOT, "traits", "x", { type: "gate", gate: "Bad Gate" })
  );
});

Deno.test("sessionLeafUri: plain and player-grouped", () => {
  assertEquals(SESSION_LEAVES, ["main", "update", "delivery"] as const);
  assertEquals(
    sessionLeafUri(ROOT, "triage-2026", "main", { date: D }),
    "immutable://open/staff/sessions/triage-2026/20260702093000-main.md",
  );
  assertEquals(
    sessionLeafUri(ROOT, "triage-2026", "update", { player: "lead-qa", date: D }),
    "immutable://open/staff/sessions/triage-2026/players/lead-qa/20260702093000-update.md",
  );
});

Deno.test("sessionGateUri and sessionAssetUri", () => {
  assertEquals(
    sessionGateUri(ROOT, "triage-2026", "all-p0s-closed"),
    "immutable://open/staff/sessions/triage-2026/gates/all-p0s-closed.md",
  );
  assertEquals(
    sessionAssetUri(ROOT, "triage-2026", "report/summary.html"),
    "immutable://open/staff/sessions/triage-2026/assets/report/summary.html",
  );
  assertThrows(() => sessionAssetUri(ROOT, "triage-2026", "../escape"));
  assertThrows(() => sessionAssetUri(ROOT, "triage-2026", "/abs"));
});
