/**
 * `staff list <kind>` — canon names plus pending-proposal counts.
 * All listing goes through fn=find&format=uris (see rig-loader notes).
 */

import { type Kind, parseUri } from "../../protocol.ts";
import {
  findUris,
  loadStaffRig,
  type RigLike,
  STAFF_ROOT,
} from "../rig-loader.ts";
import { resolveKind } from "./add.ts";

export interface ListEntry {
  name: string;
  canon: boolean;
  proposals: number;
}

export async function kindNames(rig: RigLike, kind: Kind): Promise<string[]> {
  const uris = await findUris(rig, `${STAFF_ROOT}canon/${kind}/`);
  const names = new Set<string>();
  for (const u of uris) {
    const p = parseUri(STAFF_ROOT, u);
    if (p?.at === "canon" && p.kind === kind) names.add(p.name);
  }
  return [...names].sort();
}

export async function list(
  kindArg: string,
  opts: { rig?: string },
): Promise<ListEntry[]> {
  const kind = resolveKind(kindArg);
  const { rig } = await loadStaffRig({ explicit: opts.rig });

  const canonNames = new Set(await kindNames(rig, kind));
  const proposalTs = new Map<string, Set<string>>();
  for (const u of await findUris(rig, `${STAFF_ROOT}proposal/${kind}/`)) {
    const p = parseUri(STAFF_ROOT, u);
    if (p?.at !== "proposal" || p.kind !== kind) continue;
    if (!proposalTs.has(p.name)) proposalTs.set(p.name, new Set());
    proposalTs.get(p.name)!.add(p.ts);
  }

  const names = [...new Set([...canonNames, ...proposalTs.keys()])].sort();
  return names.map((name) => ({
    name,
    canon: canonNames.has(name),
    proposals: proposalTs.get(name)?.size ?? 0,
  }));
}
