/**
 * @module
 * Plugin entry for the staff rig. The canonical rig lives in the
 * published package (`src/rig.ts` → export `./rig`); this file exists
 * so the plugin's MCP launcher has a stable local path to hand
 * `bnd node`. Requires the package to be published at this version.
 */
export { default } from "jsr:@bandeira-tech/staff@^0.2.0/rig";
