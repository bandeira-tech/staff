/**
 * @module
 * Default staff rig — loadable by `bnd node`.
 *
 * Wires an FsStore-backed b3nd rig over the staff URI namespace
 * (`immutable://open/staff/**`). Modeled on the cc-chat rig.
 *
 *   bnd node ./staff.rig.ts --http=7373    # no CORS — use for tools, not browsers
 *   bnd node ./staff.rig.ts --mcp          # MCP stdio (plugin entry point)
 *   deno run --allow-net --allow-read --allow-write --allow-env \
 *     ./serve-http.ts                      # HTTP + CORS for any localhost origin
 *
 * Use `serve-http.ts` whenever a browser (or any non-rig origin) needs
 * to talk to the rig — `bnd node --http` ships no CORS and a browser
 * fetch from a different origin will be blocked.
 *
 * Data dir resolves in this order:
 *   1. $STAFF_DATA_DIR
 *   2. ~/.staff/fs
 *
 * The rig deliberately does NOT serve a web UI — that is a separate
 * application concern. Whoever wants a UI builds one against the rig's
 * HTTP / MCP / WS surface.
 */

import { ensureDir } from "jsr:@std/fs@^1/ensure-dir";
import { walk } from "jsr:@std/fs@^1/walk";
import { dirname } from "jsr:@std/path@^1/dirname";
import { relative } from "jsr:@std/path@^1/relative";

import { connection, Rig } from "jsr:@bandeira-tech/b3nd-core@^0.24.0/rig";
import { FsStore } from "jsr:@bandeira-tech/b3nd-save@^0.12.1/fs";
import type { FsExecutor } from "jsr:@bandeira-tech/b3nd-save@^0.12.1/fs";
import { BYTES_ENTITY } from "jsr:@bandeira-tech/b3nd-save@^0.12.1/entity";
import { mapToBytes, SaveClient } from "jsr:@bandeira-tech/b3nd-save@^0.12.1/clients";

const STAFF_URI_PATTERN = "immutable://open/staff/**";

function resolveDataDir(): string {
  const env = Deno.env.get("STAFF_DATA_DIR");
  if (env) return env;
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("STAFF_DATA_DIR unset and HOME unset");
  return `${home}/.staff/fs`;
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

// UPSTREAM_GAP(b3nd-save↔b3nd-move): FsStore-bytes read returns each slot as
// `{ payload: ReadableStream }`. The HTTP wire's outputs-frame codec expects
// `Uint8Array` for raw bytes; a stream hits the JSON.stringify fallback and
// serializes as `{}`. Buffer per slot here as a local workaround. Carried
// over from b3nd-cc-chat — remove once upstream codec handles ReadableStream
// payloads.
// deno-lint-ignore no-explicit-any
function bufferStreamsInRead<T extends { read: (urls: string[]) => Promise<any> }>(
  inner: T,
): T {
  const orig = inner.read.bind(inner);
  // deno-lint-ignore no-explicit-any
  inner.read = (async (urls: string[]): Promise<any> => {
    const rows = (await orig(urls)) as Array<[string, unknown]>;
    return Promise.all(rows.map(async ([uri, payload]) => {
      if (payload && typeof payload === "object" &&
          typeof (payload as ReadableStream).getReader === "function") {
        const bytes = new Uint8Array(
          await new Response(payload as ReadableStream<Uint8Array>).arrayBuffer(),
        );
        return [uri, bytes];
      }
      return [uri, payload];
    }));
  }) as T["read"];
  return inner;
}

// UPSTREAM_GAP(b3nd-save): SaveClient.receive forwards mapToBytes-wrapped
// payloads to FsStore.write, which rejects anything that isn't Uint8Array or
// ReadableStream — but the rejection bubbles back as `accepted: true` with
// no on-disk artifact. Strings (staff's only payload shape) vanish silently.
// Coerce here. Remove once SaveClient propagates the FsStore error correctly.
//
// UPSTREAM_GAP(b3nd-move-mcp): the MCP `b3nd_read` response serializes a
// Uint8Array as a numeric-indexed object — painful for any consumer that
// expects a string body. Staff URIs only carry text bodies (markdown / JSON),
// so we decode bytes → string at the rig boundary.
const TEXT_ENC = new TextEncoder();
const TEXT_DEC = new TextDecoder();

// deno-lint-ignore no-explicit-any
function staffTextPayloads<T extends { receive: (msgs: any) => Promise<any>; read: (urls: string[]) => Promise<any> }>(
  inner: T,
): T {
  const origReceive = inner.receive.bind(inner);
  // deno-lint-ignore no-explicit-any
  inner.receive = ((msgs: Array<[string, unknown]>): Promise<any> =>
    origReceive(
      msgs.map(([uri, p]) =>
        typeof p === "string" ? [uri, TEXT_ENC.encode(p)] : [uri, p]
      ),
    )) as T["receive"];

  const origRead = inner.read.bind(inner);
  // deno-lint-ignore no-explicit-any
  inner.read = (async (urls: string[]): Promise<any> => {
    const rows = (await origRead(urls)) as Array<[string, unknown]>;
    return rows.map(([uri, p]) =>
      p instanceof Uint8Array ? [uri, TEXT_DEC.decode(p)] : [uri, p]
    );
  }) as T["read"];

  return inner;
}

export default async function staffRig(): Promise<Rig> {
  const root = resolveDataDir();
  await ensureDir(root);

  const store = new FsStore(root, fsExecutor());
  await store.provisionEntity(store.entitySupport(BYTES_ENTITY));

  const client = staffTextPayloads(
    bufferStreamsInRead(new SaveClient(mapToBytes, BYTES_ENTITY, store)),
  );
  const conn = connection(client, [STAFF_URI_PATTERN]);

  return new Rig({
    routes: {
      receive: [conn],
      read: [conn],
      observe: [conn],
    },
  });
}
