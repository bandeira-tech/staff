import { assertEquals } from "@std/assert";
import { loadStaffRig, STAFF_ROOT, receiveSettled } from "../src/cli/rig-loader.ts";

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
