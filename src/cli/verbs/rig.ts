/**
 * `staff rig` — show the resolved rig + health, or persist a default.
 */

import { configPath, loadCliConfig, saveCliConfig } from "../config.ts";
import { loadStaffRig, type RigOrigin } from "../rig-loader.ts";

export interface RigInfo {
  input: string;
  origin: RigOrigin;
  dataDir: string;
  status?: unknown;
  statusError?: string;
}

export async function rigInfo(opts: { explicit?: string }): Promise<RigInfo> {
  const { rig, source } = await loadStaffRig(opts);
  const home = Deno.env.get("HOME") ?? "";
  const dataDir = Deno.env.get("STAFF_DATA_DIR") ?? `${home}/.staff/fs`;
  const info: RigInfo = {
    input: source.input,
    origin: source.origin,
    dataDir,
  };
  if (typeof rig.status === "function") {
    try {
      info.status = await rig.status();
    } catch (e) {
      info.statusError = e instanceof Error ? e.message : String(e);
    }
  }
  return info;
}

export async function setRig(input: string): Promise<string> {
  const config = await loadCliConfig();
  config.rig = input;
  await saveCliConfig(config);
  return configPath();
}
