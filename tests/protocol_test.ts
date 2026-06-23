/**
 * Protocol tests — URI shape, name validation, builders/parsers.
 *
 * These are pure-function tests for the cc-chat:// vocabulary:
 *
 *   cc-chat://stream/{name}      — message from {name}
 *   cc-chat://presence/{name}    — presence event from {name}
 *
 * `{name}` is [a-z0-9][a-z0-9-]{0,31}.
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  isValidName,
  parseUri,
  presenceUri,
  SCHEME,
  streamUri,
} from "../src/protocol.ts";

Deno.test("SCHEME is the cc-chat scheme prefix", () => {
  assertEquals(SCHEME, "cc-chat://");
});

Deno.test("isValidName accepts simple lowercase names", () => {
  assert(isValidName("researcher"));
  assert(isValidName("a"));
  assert(isValidName("writer-2"));
  assert(isValidName("a" + "b".repeat(31))); // exactly 32 = max
});

Deno.test("isValidName rejects empty, uppercase, leading hyphen, too long", () => {
  assert(!isValidName(""));
  assert(!isValidName("Researcher"));
  assert(!isValidName("-leading"));
  assert(!isValidName("has spaces"));
  assert(!isValidName("has_underscore"));
  assert(!isValidName("a".repeat(33)));
});

Deno.test("streamUri builds cc-chat://stream/{name}", () => {
  assertEquals(streamUri("researcher"), "cc-chat://stream/researcher");
});

Deno.test("streamUri throws on invalid name", () => {
  assertThrows(() => streamUri("Bad Name"));
});

Deno.test("presenceUri builds cc-chat://presence/{name}", () => {
  assertEquals(presenceUri("writer"), "cc-chat://presence/writer");
});

Deno.test("presenceUri throws on invalid name", () => {
  assertThrows(() => presenceUri(""));
});

Deno.test("parseUri returns stream variant", () => {
  assertEquals(parseUri("cc-chat://stream/researcher"), {
    kind: "stream",
    name: "researcher",
  });
});

Deno.test("parseUri returns presence variant", () => {
  assertEquals(parseUri("cc-chat://presence/writer"), {
    kind: "presence",
    name: "writer",
  });
});

Deno.test("parseUri returns null on unknown scheme", () => {
  assertEquals(parseUri("other://stream/x"), null);
});

Deno.test("parseUri returns null on unknown channel", () => {
  assertEquals(parseUri("cc-chat://archive/x"), null);
});

Deno.test("parseUri returns null on invalid name", () => {
  assertEquals(parseUri("cc-chat://stream/Bad"), null);
});

Deno.test("parseUri returns null on missing name", () => {
  assertEquals(parseUri("cc-chat://stream/"), null);
  assertEquals(parseUri("cc-chat://stream"), null);
});

Deno.test("parseUri returns null on extra path segments", () => {
  assertEquals(parseUri("cc-chat://stream/researcher/extra"), null);
});
