/**
 * room-cat.ts — read URIs straight from the smoke-rig's FS store.
 * Bypasses the HTTP read path (which is currently broken — payload comes
 * back as `{}`). Pure FS reads work because the smoke rig writes one .bin
 * file per URI under .cc-chat-smoke/fs/.
 *
 *   deno run --allow-read scripts/room-cat.ts <uri> [<uri> ...]
 *   deno run --allow-read scripts/room-cat.ts --ls immutable://open/cc-chat/<room>/
 *
 * URI → path:  immutable://open/cc-chat/X → .cc-chat-smoke/fs/immutable_open/cc-chat/X.bin
 * Replace `://` with `_`, then prefix with the FS root, then append .bin.
 */
import { walk } from "jsr:@std/fs@1/walk";

const FS_ROOT = `${Deno.cwd()}/.cc-chat-smoke/fs`;

function uriToPath(uri: string): string {
  return `${FS_ROOT}/${uri.replace("://", "_")}.bin`;
}

function pathToUri(path: string): string {
  const rel = path.slice(FS_ROOT.length + 1).replace(/\.bin$/, "");
  return rel.replace("_", "://");
}

const argv = [...Deno.args];

if (argv[0] === "--ls") {
  const prefix = argv[1];
  if (!prefix) {
    console.error("usage: room-cat.ts --ls <uri-prefix>");
    Deno.exit(2);
  }
  const fsPrefix = `${FS_ROOT}/${prefix.replace("://", "_")}`;
  try {
    for await (const entry of walk(fsPrefix, { exts: [".bin"], includeDirs: false })) {
      console.log(pathToUri(entry.path));
    }
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    Deno.exit(1);
  }
} else {
  for (const uri of argv) {
    const path = uriToPath(uri);
    try {
      const content = await Deno.readTextFile(path);
      console.log(`=== ${uri} ===`);
      console.log(content);
    } catch (e) {
      console.error(`error reading ${uri}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
