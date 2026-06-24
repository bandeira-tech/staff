import { assert, assertEquals } from "@std/assert";
import {
  gradientStops,
  rosterFromObserved,
} from "../src/roster.ts";
import { joinUri, endUri, msgUri } from "../src/protocol.ts";

const ROOT = "immutable://open/cc-chat/";
const ROOM = "20260624120000-r";

Deno.test("rosterFromObserved derives joined and spoken sets", () => {
  const deliveries = [
    { uri: joinUri(ROOT, ROOM, "src-auth"), payload: null },
    { uri: msgUri(ROOT, ROOM, "src-auth", "hello"), payload: "hello" },
    { uri: joinUri(ROOT, ROOM, "src-db"), payload: null },
  ];
  const r = rosterFromObserved(ROOT, deliveries);
  assertEquals(r.joined, ["src-auth", "src-db"]);
  assertEquals(r.spoken, ["src-auth"]);
  assertEquals(r.names, ["src-auth", "src-db"]);
});

Deno.test("rosterFromObserved subtracts ended participants from joined", () => {
  const deliveries = [
    { uri: joinUri(ROOT, ROOM, "src-auth"), payload: null },
    { uri: endUri(ROOT, ROOM, "src-auth"), payload: null },
    { uri: joinUri(ROOT, ROOM, "src-db"), payload: null },
  ];
  const r = rosterFromObserved(ROOT, deliveries);
  assertEquals(r.joined, ["src-db"]);
  assertEquals(r.names, ["src-auth", "src-db"]); // names = union of ever-seen
});

Deno.test("gradientStops drops entries older than windowMs", () => {
  const lastSeen = new Map<string, number>([["a", 1000], ["b", 500]]);
  const stops = gradientStops(lastSeen, 2000, 1000);
  assertEquals(stops.map((s) => s.name), ["a"]);
});
