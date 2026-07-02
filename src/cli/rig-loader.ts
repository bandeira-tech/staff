/**
 * Rig resolution + loading for the staff CLI.
 *
 * Resolution order:
 *   1. Explicit `--rig <path|url>`
 *   2. $STAFF_RIG
 *   3. `rig` in ~/.staff/config.json (set via `staff rig <path>`)
 *   4. Bundled default (../rig.ts — FsStore at $STAFF_DATA_DIR or ~/.staff/fs)
 *
 * Module convention (duck-typed default export), same as `bnd`:
 *   export default rig | () => rig | async (env) => rig
 *
 * UPSTREAM_GAP(b3nd-cli): this reimplements b3nd-cli's src/rig-loader.ts
 * because @bandeira-tech/b3nd-cli@0.5.0 exports only its main entry.
 * If b3nd-cli grows a `./rig-loader` export, replace this module with
 * that import.
 */

import { loadCliConfig } from "./config.ts";

export const STAFF_ROOT = "immutable://open/staff/";

export type RigOrigin = "explicit" | "env" | "config" | "bundled";

export interface RigLike {
  receive(
    outputs: Array<[string, unknown]>,
  ): Promise<Array<{ accepted?: boolean; error?: string }>>;
  read(locators: string[]): Promise<Array<[string, unknown]>>;
  status?(): Promise<unknown>;
}

export interface LoadedRig {
  rig: RigLike;
  source: { url: string; input: string; origin: RigOrigin };
}

export function bundledRigUrl(): string {
  return new URL("../rig.ts", import.meta.url).href;
}

/** Turn a user-supplied rig location into a dynamic-import URL. */
export function toImportUrl(input: string, cwd: string): string {
  if (/^(jsr|npm|https?|file):/i.test(input)) return input;
  const abs = input.startsWith("/") ? input : `${cwd}/${input}`;
  return `file://${abs}`;
}

export function isRigLike(x: unknown): x is RigLike {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.receive === "function" && typeof r.read === "function";
}

export async function loadStaffRig(
  opts: { explicit?: string },
): Promise<LoadedRig> {
  const env = Deno.env.get("STAFF_RIG") ?? undefined;
  const config = await loadCliConfig();
  const chosen: { input: string; origin: RigOrigin } = opts.explicit
    ? { input: opts.explicit, origin: "explicit" }
    : env
    ? { input: env, origin: "env" }
    : config.rig
    ? { input: config.rig, origin: "config" }
    : { input: bundledRigUrl(), origin: "bundled" };

  const url = toImportUrl(chosen.input, Deno.cwd());
  let mod: { default?: unknown };
  try {
    mod = await import(url);
  } catch (e) {
    throw new Error(
      `failed to import rig from ${chosen.input} (${chosen.origin}): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  if (mod.default === undefined) {
    throw new Error(
      `rig module ${chosen.input} has no default export\n` +
        `  expected: export default rig | (env) => rig | async (env) => rig`,
    );
  }
  const exported = mod.default;
  const rig = typeof exported === "function"
    ? await (exported as (env: Record<string, string>) => unknown)(
      Deno.env.toObject(),
    )
    : exported;
  if (!isRigLike(rig)) {
    throw new Error(
      `rig module ${chosen.input} default export is not a rig\n` +
        `  expected an object with receive / read methods`,
    );
  }
  return { rig, source: { url, input: chosen.input, origin: chosen.origin } };
}

/**
 * Deep listing under a prefix. Uses fn=find + format=uris and never
 * format=full: the bundled rig's text-decode wrappers only reach
 * top-level payloads, so nested full rows would come back undecoded.
 */
export async function findUris(
  rig: RigLike,
  prefix: string,
): Promise<string[]> {
  const [row] = await rig.read([`${prefix}**?fn=find&format=uris`]);
  const payload = row?.[1];
  return Array.isArray(payload) ? (payload as string[]) : [];
}

/**
 * Receive outputs and wait for the write to be durable. b3nd-core's
 * Rig.receive returns an OperationHandle: awaiting it yields the
 * pipeline ack, while `.settled` resolves once routes (and their
 * stores) have fully settled — required for read-after-write
 * correctness in a short-lived process. Foreign rigs whose receive
 * returns a plain promise settle on the ack itself.
 */
export async function receiveSettled(
  rig: RigLike,
  outputs: Array<[string, unknown]>,
): Promise<Array<{ accepted?: boolean; error?: string }>> {
  const op = rig.receive(outputs);
  const results = await op;
  const settled = (op as { settled?: Promise<unknown> }).settled;
  if (settled && typeof settled.then === "function") await settled;
  return results;
}
