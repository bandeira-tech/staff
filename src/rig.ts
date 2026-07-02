/**
 * @module
 * Default staff rig — the bundled rig the `staff` CLI loads when no
 * other rig is configured, and the module `bnd node` hosts for MCP/HTTP.
 *
 *   bnd node jsr:@bandeira-tech/staff/rig --mcp                 # MCP stdio
 *   bnd node jsr:@bandeira-tech/staff/rig --http --cors '*'     # HTTP + CORS (browsers, atrium)
 *
 * Data dir resolves in this order:
 *   1. $STAFF_ROOT
 *   2. $STAFF_DATA_DIR (back-compat alias)
 *   3. ~/.staff
 *
 * The rig store is a TRANSPARENT bare tree: the store URI IS the
 * relative filesystem path (no `immutable_open/` prefix, no `.bin`
 * suffix). Store bookkeeping lives in `.b3nd/entities/` (dot-prefixed,
 * ignored by conventional tree walkers). The rig root and the skill's
 * by-hand root are the same directory — `canon/traits/x/main.md` sits
 * directly under the root, readable by any tool; non-staff files like
 * `config.json` are invisible to the grammar.
 *
 * staffTreeMapper owns both URI-prefix translation and text/stream
 * coercion. The old UPSTREAM_GAP wrappers (bufferStreamsInRead,
 * staffTextPayloads) are deleted — the mapper supersedes them.
 *
 * The rig deliberately does NOT serve a web UI — that is a separate
 * application concern (see atrium).
 */

import { ensureDir } from "jsr:@std/fs@^1/ensure-dir";
import { walk } from "jsr:@std/fs@^1/walk";
import { dirname } from "jsr:@std/path@^1/dirname";
import { relative } from "jsr:@std/path@^1/relative";

import { connection, Rig } from "jsr:@bandeira-tech/b3nd-core@^0.24.0/rig";
import { FsStore } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/fs";
import type { FsExecutor } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/fs";
import { BYTES_ENTITY } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/entity";
import type { EntityRecord } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/entity";
import { SaveClient } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/clients";
import type { SaveMapper } from "jsr:@bandeira-tech/b3nd-save@^0.13.0/clients";

const STAFF_URI_PATTERN = "immutable://open/staff/**";
const WIRE_PREFIX = "immutable://open/staff/";

/**
 * Bidirectional codec between the staff wire URI vocabulary
 * (`immutable://open/staff/…`) and the transparent FsStore
 * (store URI = relative filesystem path under rootDir).
 *
 * toStore  — strips the wire prefix; query string survives as suffix.
 * fromStore — re-adds the wire prefix; drops dot-prefixed entries
 *             (`.b3nd/`, `.DS_Store`, …) by returning null; buffers
 *             ReadableStream payloads to Uint8Array and decodes to
 *             string (staff URIs carry only text bodies).
 *
 * This mapper supersedes the old bufferStreamsInRead / staffTextPayloads
 * UPSTREAM_GAP wrappers — URI translation and payload coercion now live
 * in the same place, as SaveMapper intends.
 */
export const staffTreeMapper: SaveMapper<string | Uint8Array, string> = {
  toStore(wireUri: string, payload?: string | Uint8Array) {
    if (!wireUri.startsWith(WIRE_PREFIX)) {
      throw new Error(`foreign uri: ${wireUri}`);
    }
    const storeUri = wireUri.slice(WIRE_PREFIX.length);
    return {
      uri: storeUri,
      record: payload === undefined ? undefined : {
        payload: typeof payload === "string"
          ? new TextEncoder().encode(payload)
          : payload,
      },
    };
  },

  async fromStore(storeUri: string, record?: EntityRecord) {
    // Dotfile check on the path part only — the query string is params.
    const qIdx = storeUri.indexOf("?");
    const pathPart = qIdx >= 0 ? storeUri.slice(0, qIdx) : storeUri;
    if (pathPart.split("/").some((seg) => seg.startsWith("."))) {
      return null;
    }
    const wireUri = WIRE_PREFIX + storeUri;
    if (record === undefined) {
      return { uri: wireUri };
    }
    const raw = record.payload;
    let bytes: Uint8Array;
    if (
      raw !== null && raw !== undefined && typeof raw === "object" &&
      typeof (raw as ReadableStream).getReader === "function"
    ) {
      bytes = new Uint8Array(
        await new Response(raw as ReadableStream<Uint8Array>).arrayBuffer(),
      );
    } else if (raw instanceof Uint8Array) {
      bytes = raw;
    } else {
      bytes = new Uint8Array(0);
    }
    return { uri: wireUri, payload: new TextDecoder().decode(bytes) };
  },
};

function resolveDataDir(): string {
  const root = Deno.env.get("STAFF_ROOT");
  if (root) return root;
  const env = Deno.env.get("STAFF_DATA_DIR");
  if (env) return env;
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("STAFF_ROOT, STAFF_DATA_DIR unset and HOME unset");
  return `${home}/.staff`;
}

function fsExecutor(): FsExecutor {
  return {
    async readFile(path) {
      const f = await Deno.open(path, { read: true });
      return f.readable;
    },
    async writeFile(path, content) {
      await ensureDir(dirname(path));
      if (content instanceof Uint8Array) {
        await Deno.writeFile(path, content);
        return;
      }
      const f = await Deno.open(path, { write: true, create: true, truncate: true });
      await content.pipeTo(f.writable);
    },
    async removeFile(path) {
      await Deno.remove(path);
    },
    async exists(path) {
      try { await Deno.stat(path); return true; } catch { return false; }
    },
    async listFiles(dir) {
      const out: string[] = [];
      try {
        for await (const e of Deno.readDir(dir)) if (e.isFile) out.push(e.name);
      } catch { /* missing dir → empty list per FsExecutor contract */ }
      return out;
    },
    async *walkFiles(dir) {
      try {
        for await (
          const entry of walk(dir, {
            includeDirs: false,
            includeFiles: true,
            includeSymlinks: false,
            followSymlinks: false,
          })
        ) {
          yield relative(dir, entry.path).replaceAll("\\", "/");
        }
      } catch { /* missing dir → empty walk */ }
    },
  };
}

export default async function staffRig(): Promise<Rig> {
  const root = resolveDataDir();
  await ensureDir(root);

  const store = new FsStore(root, fsExecutor());
  await store.provisionEntity(store.entitySupport(BYTES_ENTITY));

  const client = new SaveClient(staffTreeMapper, BYTES_ENTITY, store);
  const conn = connection(client, [STAFF_URI_PATTERN]);

  return new Rig({
    routes: {
      receive: [conn],
      read: [conn],
      observe: [conn],
    },
  });
}
