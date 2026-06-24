import { assert, assertEquals } from "@std/assert";
import {
  metaUri, joinUri, msgUri, pauseUri, resumeUri, endUri, outputUri,
  parseUri, mintRoom,
} from "../src/protocol.ts";

const ROOT = "immutable://open/cc-chat/";

Deno.test("coordination lifecycle on the wire", async () => {
  const room = mintRoom("design-review");
  const rig = makeFakeRig(); // helper defined in the test file

  // 1. Manager mints meta.md
  await rig.receive(metaUri(ROOT, room), "---\nroom: " + room + "\n---\n# Goal\n...");

  // 2. Manager joins
  await rig.receive(joinUri(ROOT, room, "manager"), '{"role":"manager"}');

  // 3. Two participants join
  await rig.receive(joinUri(ROOT, room, "src-auth"), '{"scope":"src/auth","role":"x"}');
  await rig.receive(joinUri(ROOT, room, "src-db"), '{"scope":"src/db","role":"y"}');

  // 4. Initiative msgs
  await rig.receive(msgUri(ROOT, room, "src-auth", "starting"), "looking into auth flow");
  await rig.receive(msgUri(ROOT, room, "src-db", "starting"), "schema notes incoming");

  // 5. Manager pauses, resumes
  await rig.receive(pauseUri(ROOT, room), "checking with user");
  await rig.receive(resumeUri(ROOT, room), "");

  // 6. Manager outputs deliverable
  await rig.receive(outputUri(ROOT, room, "deliverable"), "# Deliverable\n...");

  // 7. Manager ends room
  await rig.receive(endUri(ROOT, room, "manager"), "");

  // Verify: read everything back, parse, count types
  const uris = rig.allUris();
  const parsed = uris.map((u) => parseUri(ROOT, u)).filter((p) => p !== null);
  const counts = parsed.reduce<Record<string, number>>((acc, p) => {
    acc[p!.type] = (acc[p!.type] ?? 0) + 1; return acc;
  }, {});
  assertEquals(counts.meta, 1);
  assertEquals(counts.join, 3);  // manager + 2 participants
  assertEquals(counts.msg, 2);
  assertEquals(counts.pause, 1);
  assertEquals(counts.resume, 1);
  assertEquals(counts.output, 1);
  assertEquals(counts.end, 1);
});

function makeFakeRig() {
  const store = new Map<string, string>();
  return {
    async receive(uri: string, payload: string) { store.set(uri, payload); },
    async read(uris: string[]): Promise<[string, string | null][]> {
      return uris.map((u) => [u, store.get(u) ?? null]);
    },
    allUris() { return [...store.keys()]; },
  };
}
