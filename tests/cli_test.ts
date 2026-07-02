import { assertEquals } from "@std/assert";
import { loadStaffRig, STAFF_ROOT, receiveSettled } from "../src/cli/rig-loader.ts";
import { add, addGate, resolveKind } from "../src/cli/verbs/add.ts";
import { assertRejects, assertThrows } from "@std/assert";

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
