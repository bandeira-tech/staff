import { assertEquals } from "@std/assert";
import { observeStreamFromRig } from "../src/client.ts";
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

  const consumer = (async () => {
    for await (const d of observeStreamFromRig(node, "cc-chat://**", abort.signal)) {
      seen.push(d);
      if (seen.length >= 2) abort.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 10));
  await node.receive("cc-chat://stream/a/20260623-aaa", "hi");
  await node.receive("cc-chat://stream/b/20260623-bbb", "there");
  await consumer;

  assertEquals(seen.length, 2);
  assertEquals(seen[0].uri, "cc-chat://stream/a/20260623-aaa");
  assertEquals(seen[0].payload, "hi");
});
