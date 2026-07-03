/**
 * `staff promote <kind> <name>` — the builder's act: materialize
 * canon/{kind}/{name}/ from the living proposal. Skips update-log leaves
 * (proposal-update). Reads each proposal leaf individually (never fn=full —
 * see rig-loader notes) and receives it at the equivalent canon URI.
 */

import {
  canonUri,
  isValidName,
  parseUri,
  type PrimitiveLeaf,
} from "../../protocol.ts";
import { findUris, loadStaffRig, receiveSettled, STAFF_ROOT } from "../rig-loader.ts";
import { resolveKind } from "./add.ts";

export async function promote(
  kindArg: string,
  name: string,
  opts: { rig?: string },
): Promise<{ written: string[] }> {
  const kind = resolveKind(kindArg);
  if (!isValidName(name)) throw new Error(`invalid name: ${name}`);
  const { rig } = await loadStaffRig({ explicit: opts.rig });

  const uris = await findUris(rig, `${STAFF_ROOT}proposal/${kind}/${name}/`);
  const leaves: Array<{ uri: string; leaf: PrimitiveLeaf }> = [];
  for (const uri of uris) {
    const p = parseUri(STAFF_ROOT, uri);
    if (!p) continue;
    // Skip update-log leaves — they are out of band.
    if (p.at === "proposal-update") continue;
    if (p.at !== "proposal" || p.kind !== kind || p.name !== name) continue;
    leaves.push({ uri, leaf: p.leaf });
  }
  if (leaves.length === 0) {
    throw new Error(`no proposal for ${kind}/${name}`);
  }

  const written: string[] = [];
  for (const { uri, leaf } of leaves) {
    const [row] = await rig.read([uri]);
    const payload = row?.[1];
    if (payload === undefined || payload === null) {
      throw new Error(`proposal leaf unreadable: ${uri}`);
    }
    const target = canonUri(STAFF_ROOT, kind, name, leaf);
    const [res] = await receiveSettled(rig, [[target, payload]]);
    if (!res?.accepted) {
      throw new Error(
        `promotion write rejected: ${target} — ${res?.error ?? "no reason"}`,
      );
    }
    written.push(target);
  }
  return { written };
}
