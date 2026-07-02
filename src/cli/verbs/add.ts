/**
 * `staff add` — propose a primitive (or a gate on one). Writes ONLY
 * under proposal/{kind}/{name}/{ts}/ — promotion is the builder's act
 * (`staff promote`).
 */

import {
  formatTs,
  KIND_ALIASES,
  type Kind,
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

async function receiveOne(
  uri: string,
  prose: string,
  rig?: string,
): Promise<{ uri: string }> {
  const { rig: loaded } = await loadStaffRig({ explicit: rig });
  const [res] = await receiveSettled(loaded, [[uri, prose]]);
  if (!res?.accepted) {
    throw new Error(`write rejected: ${uri} — ${res?.error ?? "no reason given"}`);
  }
  return { uri };
}

export async function add(opts: {
  kindArg: string;
  name: string;
  prose: string;
  rig?: string;
  now?: Date;
}): Promise<{ uri: string }> {
  const kind = resolveKind(opts.kindArg);
  const ts = formatTs(opts.now ?? new Date());
  const uri = proposalUri(STAFF_ROOT, kind, opts.name, ts);
  return receiveOne(uri, opts.prose, opts.rig);
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
  const ts = formatTs(opts.now ?? new Date());
  const uri = proposalUri(STAFF_ROOT, kind, name, ts, { type: "gate", gate });
  return receiveOne(uri, opts.prose, opts.rig);
}
