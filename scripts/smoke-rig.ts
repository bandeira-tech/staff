/**
 * Smoke rig — hand-rolled FsStore-backed HTTP rig for end-to-end testing.
 *
 * Mounts an FsStore on .cc-chat-smoke/fs/ and serves the b3nd HTTP API
 * on port 7373. Used by Task 12 to exercise the unified URI grammar.
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

// Wire into rig — match all immutable:// URIs
const conn = connection(saveClient, ["immutable://**"]);

const rig = new Rig({
  routes: {
    receive: [conn],
    read: [conn],
    observe: [conn],
  },
});

// ── Serve ──

console.log(`[smoke-rig] FsStore root: ${ROOT_DIR}`);
console.log("[smoke-rig] Listening on http://127.0.0.1:7373");

Deno.serve({ port: 7373, hostname: "127.0.0.1" }, httpApi(rig));
