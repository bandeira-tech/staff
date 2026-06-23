import { assertEquals } from "@std/assert";
import { gradientStops, rosterFromObserved } from "../src/roster.ts";

Deno.test("rosterFromObserved separates speaking and presence under a root", () => {
  const r = rosterFromObserved("cc-chat://", [
    { uri: "cc-chat://presence/researcher/20260623-aaa", payload: "join" },
    { uri: "cc-chat://stream/writer/20260623-bbb", payload: "hi" },
    { uri: "cc-chat://presence/writer/20260623-ccc", payload: "join" },
  ]);
  assertEquals(r.names, ["researcher", "writer"]);
  assertEquals(r.speaking, ["writer"]);
  assertEquals(r.presence, ["researcher", "writer"]);
});

Deno.test("rosterFromObserved works under an operator-chosen root", () => {
  const r = rosterFromObserved("workspace://abcd/", [
    { uri: "workspace://abcd/stream/alice/20260623-bbb", payload: "hi" },
    { uri: "cc-chat://stream/wrong-root/20260623-ccc", payload: "hi" }, // ignored
  ]);
  assertEquals(r.names, ["alice"]);
  assertEquals(r.speaking, ["alice"]);
});

Deno.test("gradientStops maps age to opacity, drops expired", () => {
  const now = 10_000;
  const seen = new Map([
    ["fresh", 10_000],     // age 0
    ["mid", 5_000],        // age 5000
    ["stale", 0],          // age 10_000 — outside 9000 window
  ]);
  const stops = gradientStops(seen, now, 9_000);
  assertEquals(stops.length, 2);
  assertEquals(stops[0].name, "fresh");
  assertEquals(stops[0].opacity, 1);
  assertEquals(stops[1].name, "mid");
  // 5000/9000 fade → opacity > 0.18 floor, < 1
  if (!(stops[1].opacity > 0.18 && stops[1].opacity < 1)) {
    throw new Error(`bad opacity ${stops[1].opacity}`);
  }
});
