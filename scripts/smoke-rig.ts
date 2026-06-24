/**
 * Smoke rig — hand-rolled FsStore-backed HTTP rig for end-to-end testing.
 *
 * Mounts an FsStore on .cc-chat-smoke/fs/, serves the b3nd HTTP API on
 * port 7373, and serves the cc-chat web UI from web/ at the same origin
 * (so the browser hits /api/v1/* and /index.html / /app.js / /favicon
 * without CORS). The UI opens at http://127.0.0.1:7373/.
 *
 * Run:
 *   deno run --allow-net --allow-read --allow-write scripts/smoke-rig.ts
 */

/// <reference lib="deno.ns" />

import { ensureDir } from "jsr:@std/fs@^1/ensure-dir";
import { dirname } from "jsr:@std/path@^1/dirname";

// Sibling-repo imports via absolute paths.
// Use specific subpath imports to avoid pulling in the encrypt/identity
// modules which depend on the npm:canonicalize package not in this import map.
import { FsStore } from "/Users/m0/ws/b3nd-save/src/fs/store.ts";
import type { FsExecutor } from "/Users/m0/ws/b3nd-save/src/fs/mod.ts";
import type { StorePayload } from "/Users/m0/ws/b3nd-save/src/types.ts";
import {
  BYTES_ENTITY,
} from "/Users/m0/ws/b3nd-save/src/entity.ts";
import {
  mapToBytes,
  SaveClient,
} from "/Users/m0/ws/b3nd-save/src/clients/save-client.ts";

// Import from rig subpath to avoid identity.ts → encrypt/mod.ts → npm:canonicalize
import { connection, Rig } from "/Users/m0/ws/b3nd-core/src/rig/mod.ts";
import { httpApi } from "/Users/m0/ws/b3nd-move/src/http/service.ts";

// ── FS executor (same pattern as integration.test.ts) ──

function createFsExecutor(_rootDir: string): FsExecutor {
  return {
    async readFile(path: string): Promise<ReadableStream<Uint8Array>> {
      const file = await Deno.open(path, { read: true });
      return file.readable;
    },

    async writeFile(path: string, content: StorePayload): Promise<void> {
      await ensureDir(dirname(path));
      if (content instanceof Uint8Array) {
        await Deno.writeFile(path, content);
        return;
      }
      const file = await Deno.open(path, {
        write: true,
        create: true,
        truncate: true,
      });
      await content.pipeTo(file.writable);
    },

    async removeFile(path: string): Promise<void> {
      await Deno.remove(path);
    },

    async exists(path: string): Promise<boolean> {
      try {
        await Deno.stat(path);
        return true;
      } catch {
        return false;
      }
    },

    async listFiles(dir: string): Promise<string[]> {
      const files: string[] = [];
      try {
        for await (const entry of Deno.readDir(dir)) {
          if (entry.isFile) files.push(entry.name);
        }
      } catch {
        return [];
      }
      return files;
    },
  };
}

// ── Setup ──

const ROOT_DIR = `${Deno.cwd()}/.cc-chat-smoke/fs`;
await ensureDir(ROOT_DIR);

const executor = createFsExecutor(ROOT_DIR);
const store = new FsStore(ROOT_DIR, executor);

// Provision the BYTES_ENTITY
const meta = store.entitySupport(BYTES_ENTITY);
await store.provisionEntity(meta);

// Build the SaveClient
const saveClient = new SaveClient(mapToBytes, BYTES_ENTITY, store);

// FsStore + bytes-entity returns `{ payload: ReadableStream }` per slot;
// SaveClient unwraps to the stream as-is. The HTTP wire's outputs-frame
// codec expects `Uint8Array` for raw bytes — a `ReadableStream` hits the
// JSON.stringify fallback and serializes as `{}`. Buffer the stream into a
// `Uint8Array` per slot before it reaches the codec. Workaround for an
// upstream gap (b3nd-save / b3nd-move); not load-bearing for in-process use.
function bufferStreamsInRead<T extends { read: (urls: string[]) => Promise<Array<readonly [string, unknown]>> }>(inner: T): T {
  const orig = inner.read.bind(inner);
  inner.read = async (urls: string[]) => {
    const rows = await orig(urls);
    return Promise.all(rows.map(async ([uri, payload]) => {
      if (payload && typeof payload === "object" && typeof (payload as ReadableStream).getReader === "function") {
        const bytes = new Uint8Array(await new Response(payload as ReadableStream<Uint8Array>).arrayBuffer());
        return [uri, bytes] as const;
      }
      return [uri, payload] as const;
    }));
  };
  return inner;
}

// Wire into rig — match all immutable:// URIs
const conn = connection(bufferStreamsInRead(saveClient), ["immutable://**"]);

const rig = new Rig({
  routes: {
    receive: [conn],
    read: [conn],
    observe: [conn],
  },
});

// ── Serve ──

const WEB_DIR = `${Deno.cwd()}/web`;
const apiHandler = httpApi(rig);

// MIME by extension — minimal set, enough for the cc-chat UI.
const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  json: "application/json",
  ico: "image/x-icon",
  png: "image/png",
};

async function serveStatic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  if (p.includes("..")) return new Response("bad path", { status: 400 });
  const fsPath = `${WEB_DIR}${p}`;
  try {
    const file = await Deno.open(fsPath, { read: true });
    const ext = p.slice(p.lastIndexOf(".") + 1).toLowerCase();
    return new Response(file.readable, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

console.log(`[smoke-rig] FsStore root:  ${ROOT_DIR}`);
console.log(`[smoke-rig] Web UI root:   ${WEB_DIR}`);
console.log("[smoke-rig] Listening on  http://127.0.0.1:7373");

Deno.serve(
  { port: 7373, hostname: "127.0.0.1" },
  (req, info) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return (apiHandler as (r: Request, i?: unknown) => Response | Promise<Response>)(req, info);
    return serveStatic(req);
  },
);
