/**
 * Throwaway variant of smoke-rig.ts that binds to port 7474 so it can be
 * run alongside the manager's rig on 7373. Used for end-to-end verification
 * of the new rig.status().resources contract.
 *
 * Identical wiring to smoke-rig.ts otherwise.
 */

/// <reference lib="deno.ns" />

import { ensureDir } from "jsr:@std/fs@^1/ensure-dir";
import { dirname } from "jsr:@std/path@^1/dirname";

import { FsStore } from "/Users/m0/ws/b3nd-save/src/fs/store.ts";
import type { FsExecutor } from "/Users/m0/ws/b3nd-save/src/fs/mod.ts";
import type { StorePayload } from "/Users/m0/ws/b3nd-save/src/types.ts";
import { BYTES_ENTITY } from "/Users/m0/ws/b3nd-save/src/entity.ts";
import {
  mapToBytes,
  SaveClient,
} from "/Users/m0/ws/b3nd-save/src/clients/save-client.ts";

import { connection, Rig } from "/Users/m0/ws/b3nd-core/src/rig/mod.ts";
import { httpApi } from "/Users/m0/ws/b3nd-move/src/http/service.ts";

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

const ROOT_DIR = `${Deno.cwd()}/.cc-chat-smoke/fs-7474`;
await ensureDir(ROOT_DIR);

const executor = createFsExecutor(ROOT_DIR);
const store = new FsStore(ROOT_DIR, executor);
const meta = store.entitySupport(BYTES_ENTITY);
await store.provisionEntity(meta);
const saveClient = new SaveClient(mapToBytes, BYTES_ENTITY, store);
const conn = connection(saveClient, ["immutable://**"]);

const rig = new Rig({
  routes: { receive: [conn], read: [conn], observe: [conn] },
});

console.log(`[smoke-rig-7474] FsStore root: ${ROOT_DIR}`);
console.log("[smoke-rig-7474] Listening on http://127.0.0.1:7474");
Deno.serve({ port: 7474, hostname: "127.0.0.1" }, httpApi(rig));
