/**
 * `staff list <kind>` — canon names plus proposal-pending flag.
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
  proposal: boolean;
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
  const proposalNames = new Set<string>();
  for (const u of await findUris(rig, `${STAFF_ROOT}proposal/${kind}/`)) {
    const p = parseUri(STAFF_ROOT, u);
    // Only count real proposal leaves (not update-log leaves).
    if (p?.at !== "proposal" || p.kind !== kind) continue;
    proposalNames.add(p.name);
  }

  const names = [...new Set([...canonNames, ...proposalNames])].sort();
  return names.map((name) => ({
    name,
    canon: canonNames.has(name),
    proposal: proposalNames.has(name),
  }));
}
