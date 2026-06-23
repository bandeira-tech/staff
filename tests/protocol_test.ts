/**
 * Protocol tests — URI shape, name validation, builders/parsers.
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  CHANNEL_PRESENCE,
  CHANNEL_STREAM,
  formatTs,
  isValidName,
  isValidNonce,
  isValidSeq,
  isValidTs,
  mintNonce,
  mintPresenceUri,
  mintSeq,
  mintStreamUri,
  parseUri,
} from "../src/protocol.ts";

Deno.test("channels are stream and presence", () => {
  assertEquals(CHANNEL_STREAM, "stream");
  assertEquals(CHANNEL_PRESENCE, "presence");
});

Deno.test("isValidName accepts simple lowercase names", () => {
  assert(isValidName("researcher"));
  assert(isValidName("a"));
  assert(isValidName("writer-2"));
  assert(isValidName("a" + "b".repeat(31)));
});

Deno.test("isValidName rejects empty, uppercase, hyphen-leading, too long", () => {
  assert(!isValidName(""));
  assert(!isValidName("Researcher"));
  assert(!isValidName("-leading"));
  assert(!isValidName("has spaces"));
  assert(!isValidName("a".repeat(33)));
});

Deno.test("formatTs formats UTC as 14 digits", () => {
  const ts = formatTs(new Date(Date.UTC(2026, 5, 23, 12, 0, 5)));
  assertEquals(ts, "20260623120005");
  assert(isValidTs(ts));
});

Deno.test("mintNonce returns 6 base32-style chars", () => {
  const n = mintNonce();
  assert(isValidNonce(n));
  assertEquals(n.length, 6);
});

Deno.test("mintSeq returns ts-nonce", () => {
  const s = mintSeq(new Date(Date.UTC(2026, 5, 23, 12, 0, 5)));
  assert(isValidSeq(s));
  assert(s.startsWith("20260623120005-"));
});

Deno.test("mintStreamUri builds cc-chat://stream/{name}/{seq}", () => {
  const uri = mintStreamUri("cc-chat://", "alice");
  assert(uri.startsWith("cc-chat://stream/alice/"));
  const parsed = parseUri("cc-chat://", uri);
  assertEquals(parsed?.channel, "stream");
  assertEquals(parsed?.name, "alice");
});

Deno.test("mintPresenceUri builds cc-chat://presence/{name}/{seq}", () => {
  const uri = mintPresenceUri("cc-chat://", "writer");
  assert(uri.startsWith("cc-chat://presence/writer/"));
  const parsed = parseUri("cc-chat://", uri);
  assertEquals(parsed?.channel, "presence");
  assertEquals(parsed?.name, "writer");
});

Deno.test("mintStreamUri throws on invalid name", () => {
  assertThrows(() => mintStreamUri("cc-chat://", "Bad"));
});

Deno.test("two mintStreamUri calls produce distinct URIs", () => {
  // Mint many; the odds of two collisions are astronomically low.
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(mintStreamUri("cc-chat://", "a"));
  assertEquals(seen.size, 200);
});

Deno.test("parseUri returns null on unknown scheme", () => {
  assertEquals(parseUri("cc-chat://", "other://stream/x/20260623120005-abc123"), null);
});

Deno.test("parseUri returns null on unknown channel", () => {
  assertEquals(parseUri("cc-chat://", "cc-chat://archive/x/20260623120005-abc123"), null);
});

Deno.test("parseUri returns null on invalid name", () => {
  assertEquals(parseUri("cc-chat://", "cc-chat://stream/Bad/20260623120005-abc123"), null);
});

Deno.test("parseUri returns null on missing seq", () => {
  assertEquals(parseUri("cc-chat://", "cc-chat://stream/alice"), null);
  assertEquals(parseUri("cc-chat://", "cc-chat://stream/alice/"), null);
});

Deno.test("parseUri returns null on malformed seq", () => {
  assertEquals(parseUri("cc-chat://", "cc-chat://stream/alice/not-a-seq"), null);
  assertEquals(parseUri("cc-chat://", "cc-chat://stream/alice/20260623120005-ABCDEF"), null);
});

Deno.test("parseUri exposes ts and nonce", () => {
  const parsed = parseUri("cc-chat://", "cc-chat://stream/alice/20260623120005-abc123");
  assertEquals(parsed, {
    channel: "stream",
    name: "alice",
    seq: "20260623120005-abc123",
    ts: "20260623120005",
    nonce: "abc123",
  });
});

Deno.test("mintStreamUri runs under any operator-chosen root", () => {
  const a = mintStreamUri("cc-chat://", "alice");
  const b = mintStreamUri("chat://team-a/", "alice");
  const c = mintStreamUri("workspace://abcd/", "alice");
  if (!a.startsWith("cc-chat://stream/alice/")) throw new Error(a);
  if (!b.startsWith("chat://team-a/stream/alice/")) throw new Error(b);
  if (!c.startsWith("workspace://abcd/stream/alice/")) throw new Error(c);
});

Deno.test("parseUri returns null for URIs outside the configured root", () => {
  const r = parseUri("chat://team-a/", "cc-chat://stream/alice/20260623120000-abcdef");
  if (r !== null) throw new Error("expected null for wrong-root uri");
});

Deno.test("parseUri returns channel/name/seq for matches", () => {
  const r = parseUri("workspace://abcd/", "workspace://abcd/stream/alice/20260623120000-abcdef");
  if (!r || r.channel !== "stream" || r.name !== "alice") {
    throw new Error(`bad parse: ${JSON.stringify(r)}`);
  }
});

Deno.test("mintStreamUri throws when root is missing or malformed", () => {
  let threw = 0;
  try { mintStreamUri("", "alice"); } catch { threw++; }
  try { mintStreamUri("cc-chat", "alice"); } catch { threw++; }      // no separator
  try { mintStreamUri("cc-chat://no-trailing-slash", "alice"); } catch { threw++; }
  if (threw !== 3) throw new Error(`expected 3 throws, got ${threw}`);
});

