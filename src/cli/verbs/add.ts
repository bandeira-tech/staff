/**
 * `staff add` — propose a primitive (or a gate on one). Writes under
 * proposal/{kind}/{name}/ (the living proposal) and appends an update leaf
 * to the out-of-band change log in one `receiveSettled` batch.
 */

import {
  KIND_ALIASES,
  type Kind,
  proposalUpdateUri,
  proposalUri,
} from "../../protocol.ts";
import { loadStaffRig, receiveSettled, STAFF_ROOT } from "../rig-loader.ts";

export function resolveKind(kindArg: string): Kind {
  const kind = KIND_ALIASES[kindArg];
  if (!kind) {
    throw new Error(
      `unknown kind: ${kindArg} (expected trait|role|play|team|staff)`,
    );
  }
  return kind;
}

export async function add(opts: {
  kindArg: string;
  name: string;
  prose: string;
  rig?: string;
  now?: Date;
}): Promise<{ uri: string }> {
  const kind = resolveKind(opts.kindArg);
  const now = opts.now ?? new Date();
  const uri = proposalUri(STAFF_ROOT, kind, opts.name);
  const updateUri = proposalUpdateUri(STAFF_ROOT, kind, opts.name, now);
  const { rig: loaded } = await loadStaffRig({ explicit: opts.rig });
  const [mainRes, _updateRes] = await receiveSettled(loaded, [
    [uri, opts.prose],
    [updateUri, "main.md updated"],
  ]);
  if (!mainRes?.accepted) {
    throw new Error(`write rejected: ${uri} — ${mainRes?.error ?? "no reason given"}`);
  }
  return { uri };
}

export async function addGate(opts: {
  path: string;
  prose: string;
  rig?: string;
  now?: Date;
}): Promise<{ uri: string }> {
  const segs = opts.path.split("/");
  if (segs.length !== 3) {
    throw new Error(`gate path must be <kind>/<name>/<gate>: ${opts.path}`);
  }
  const [kindArg, name, gate] = segs;
  const kind = resolveKind(kindArg);
  const now = opts.now ?? new Date();
  const uri = proposalUri(STAFF_ROOT, kind, name, { type: "gate", gate });
  const updateUri = proposalUpdateUri(STAFF_ROOT, kind, name, now);
  const { rig: loaded } = await loadStaffRig({ explicit: opts.rig });
  const [gateRes, _updateRes] = await receiveSettled(loaded, [
    [uri, opts.prose],
    [updateUri, `gates/${gate}.md added`],
  ]);
  if (!gateRes?.accepted) {
    throw new Error(`write rejected: ${uri} — ${gateRes?.error ?? "no reason given"}`);
  }
  return { uri };
}
