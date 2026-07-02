/**
 * `staff promote <kind> <name> [<ts>]` — the builder's act: materialize
 * canon/{kind}/{name}/ from one proposal subtree. Reads each proposal
 * leaf individually (never fn=full — see rig-loader notes) and receives
 * it at the equivalent canon URI.
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
  tsArg: string | undefined,
  opts: { rig?: string },
): Promise<{ ts: string; written: string[] }> {
  const kind = resolveKind(kindArg);
  if (!isValidName(name)) throw new Error(`invalid name: ${name}`);
  const { rig } = await loadStaffRig({ explicit: opts.rig });

  const uris = await findUris(rig, `${STAFF_ROOT}proposal/${kind}/${name}/`);
  const byTs = new Map<string, Array<{ uri: string; leaf: PrimitiveLeaf }>>();
  for (const uri of uris) {
    const p = parseUri(STAFF_ROOT, uri);
    if (p?.at !== "proposal" || p.kind !== kind || p.name !== name) continue;
    if (!byTs.has(p.ts)) byTs.set(p.ts, []);
    byTs.get(p.ts)!.push({ uri, leaf: p.leaf });
  }
  if (byTs.size === 0) throw new Error(`no proposals for ${kind}/${name}`);

  const candidates = [...byTs.keys()].sort();
  const ts = tsArg ?? candidates[candidates.length - 1];
  const chosen = byTs.get(ts);
  if (!chosen) {
    throw new Error(
      `no proposal ${ts} for ${kind}/${name} — candidates: ${
        candidates.join(", ")
      }`,
    );
  }

  const written: string[] = [];
  for (const { uri, leaf } of chosen) {
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
  return { ts, written };
}
