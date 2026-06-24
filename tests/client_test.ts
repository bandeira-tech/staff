import { assertEquals } from "@std/assert";
import { observeStreamFromRig } from "../src/client.ts";
import { msgUri, joinUri } from "../src/protocol.ts";
import { ObserveEmitter } from "@bandeira-tech/b3nd-core";

/**
 * A minimal stub rig: an ObserveEmitter with `read()` returning whatever we
 * recorded under `_emit()`. Lets us test the client-side iterator without an
 * HTTP server.
 */
function stubRig() {
  const buffer = new Map<string, string>();
  const node = new ObserveEmitter() as ObserveEmitter & {
    receive(uri: string, payload: string): Promise<void>;
    read(uris: string[]): Promise<[string, string | null][]>;
  };
  node.receive = async (uri: string, payload: string) => {
    buffer.set(uri, payload);
    // deno-lint-ignore no-explicit-any
    (node as any)._emit(uri, payload);
  };
  node.read = async (uris: string[]) =>
    uris.map((u) => [u, buffer.get(u) ?? null] as [string, string | null]);
  return node;
}

Deno.test("observeStreamFromRig surfaces deliveries posted after subscribe", async () => {
  const node = stubRig();
  const abort = new AbortController();
  const seen: { uri: string; payload: string | null }[] = [];
  const root = "immutable://open/cc-chat/";
  const room = "20260623120000-test";

  const consumer = (async () => {
    for await (const d of observeStreamFromRig(node, `${root}${room}/**`, abort.signal)) {
      seen.push(d);
      if (seen.length >= 2) abort.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 10));
  const uri1 = msgUri(root, room, "alice", "msg1");
  const uri2 = msgUri(root, room, "bob", "msg2");
  await node.receive(uri1, "hi");
  await node.receive(uri2, "there");
  await consumer;

  assertEquals(seen.length, 2);
  assertEquals(seen[0].uri, uri1);
  assertEquals(seen[0].payload, "hi");
});
