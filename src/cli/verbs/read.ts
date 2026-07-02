/** `staff read <path>` — one path under the staff root. */

import { loadStaffRig, STAFF_ROOT } from "../rig-loader.ts";

export async function readPath(
  path: string,
  opts: { rig?: string },
): Promise<string> {
  if (!path || path.startsWith("/") || path.includes("..")) {
    throw new Error(`invalid path: ${JSON.stringify(path)}`);
  }
  const uri = `${STAFF_ROOT}${path}`;
  const { rig } = await loadStaffRig({ explicit: opts.rig });
  const [row] = await rig.read([uri]);
  const payload = row?.[1];
  if (payload === undefined || payload === null) {
    throw new Error(`not found: ${uri}`);
  }
  return typeof payload === "string"
    ? payload
    : JSON.stringify(payload, null, 2);
}
