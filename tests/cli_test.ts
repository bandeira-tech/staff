import { assertEquals } from "@std/assert";
import { loadStaffRig, STAFF_ROOT, receiveSettled } from "../src/cli/rig-loader.ts";
import { add, addGate, resolveKind } from "../src/cli/verbs/add.ts";
import { assertRejects, assertThrows } from "@std/assert";
import { list } from "../src/cli/verbs/list.ts";
import { readPath } from "../src/cli/verbs/read.ts";
import { promote } from "../src/cli/verbs/promote.ts";

Deno.test("loadStaffRig: bundled rig loads and answers reads", async () => {
  const tmp = await Deno.makeTempDir();
  Deno.env.set("STAFF_DATA_DIR", tmp);
  Deno.env.delete("STAFF_RIG");
  const { rig, source } = await loadStaffRig({});
  assertEquals(source.origin, "bundled");
  const [res] = await receiveSettled(rig, [
    [`${STAFF_ROOT}canon/traits/smoke/main.md`, "smoke body"],
  ]);
  assertEquals(res.accepted, true);
  const [[uri, payload]] = await rig.read([
    `${STAFF_ROOT}canon/traits/smoke/main.md`,
  ]);
  assertEquals(uri, `${STAFF_ROOT}canon/traits/smoke/main.md`);
  assertEquals(payload, "smoke body");
});

const D = new Date(Date.UTC(2026, 6, 2, 9, 30, 0)); // 20260702093000

function freshDataDir(): Promise<string> {
  return Deno.makeTempDir().then((tmp) => {
    Deno.env.set("STAFF_DATA_DIR", tmp);
    Deno.env.delete("STAFF_RIG");
    return tmp;
  });
}

Deno.test("resolveKind maps singular to tree plural, rejects junk", () => {
  assertEquals(resolveKind("trait"), "traits");
  assertEquals(resolveKind("staff"), "staff");
  assertThrows(() => resolveKind("session"), Error, "unknown kind");
});

Deno.test("add writes a proposal main.md, never canon", async () => {
  await freshDataDir();
  const { uri } = await add({
    kindArg: "trait",
    name: "skeptical",
    prose: "You don't trust work being presented to you.",
    now: D,
  });
  assertEquals(
    uri,
    "immutable://open/staff/proposal/traits/skeptical/20260702093000/main.md",
  );
});

Deno.test("addGate writes under the proposal's gates/", async () => {
  await freshDataDir();
  const { uri } = await addGate({
    path: "trait/skeptical/no-empty-promises",
    prose: "# (MANDATORY GATE) no empty promises",
    now: D,
  });
  assertEquals(
    uri,
    "immutable://open/staff/proposal/traits/skeptical/20260702093000/gates/no-empty-promises.md",
  );
});

Deno.test("addGate rejects malformed paths loudly", async () => {
  await freshDataDir();
  await assertRejects(
    () => addGate({ path: "trait/skeptical", prose: "x" }),
    Error,
    "gate path must be <kind>/<name>/<gate>",
  );
});

Deno.test("list: canon flag and distinct proposal count", async () => {
  await freshDataDir();
  await add({ kindArg: "trait", name: "skeptical", prose: "v1", now: D });
  await add({
    kindArg: "trait",
    name: "skeptical",
    prose: "v2",
    now: new Date(Date.UTC(2026, 6, 2, 10, 0, 0)),
  });
  await add({ kindArg: "trait", name: "newbie", prose: "fresh eyes", now: D });
  assertEquals(await list("trait", {}), [
    { name: "newbie", canon: false, proposals: 1 },
    { name: "skeptical", canon: false, proposals: 2 },
  ]);
});

Deno.test("readPath returns the body; misses throw", async () => {
  await freshDataDir();
  await add({ kindArg: "trait", name: "skeptical", prose: "the body", now: D });
  assertEquals(
    await readPath("proposal/traits/skeptical/20260702093000/main.md", {}),
    "the body",
  );
  await assertRejects(
    () => readPath("canon/traits/skeptical/main.md", {}),
    Error,
    "not found",
  );
});

Deno.test("promote: latest proposal subtree materializes canon", async () => {
  await freshDataDir();
  await add({ kindArg: "trait", name: "skeptical", prose: "v1", now: D });
  const later = new Date(Date.UTC(2026, 6, 2, 10, 0, 0));
  await add({ kindArg: "trait", name: "skeptical", prose: "v2", now: later });
  await addGate({
    path: "trait/skeptical/no-empty-promises",
    prose: "gate body",
    now: later,
  });

  const res = await promote("trait", "skeptical", undefined, {});
  assertEquals(res.ts, "20260702100000");
  assertEquals(res.written.sort(), [
    "immutable://open/staff/canon/traits/skeptical/gates/no-empty-promises.md",
    "immutable://open/staff/canon/traits/skeptical/main.md",
  ]);
  assertEquals(await readPath("canon/traits/skeptical/main.md", {}), "v2");
  assertEquals(await list("trait", {}), [
    { name: "skeptical", canon: true, proposals: 2 },
  ]);
});

Deno.test("promote: explicit ts, and loud misses", async () => {
  await freshDataDir();
  await add({ kindArg: "trait", name: "skeptical", prose: "v1", now: D });
  const res = await promote("trait", "skeptical", "20260702093000", {});
  assertEquals(res.ts, "20260702093000");
  await assertRejects(
    () => promote("trait", "skeptical", "20990101000000", {}),
    Error,
    "candidates",
  );
  await assertRejects(
    () => promote("trait", "ghost", undefined, {}),
    Error,
    "no proposals",
  );
});
