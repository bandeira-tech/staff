/**
 * Tests for observeStreamFromRig — the in-process equivalent of tail().
 * Covers the same behaviors the original tail_test.ts covered (yields
 * deliveries, honors pattern filter) without needing an HTTP server.
 */
import { assertEquals } from "@std/assert";
import { observeStreamFromRig } from "../src/client.ts";
import { ObserveEmitter } from "@bandeira-tech/b3nd-core";

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

Deno.test("observeStreamFromRig yields live deliveries", async () => {
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
  await node.receive("cc-chat://stream/alice/20260623-aaa", "hello");
  await node.receive("cc-chat://stream/bob/20260623-bbb", "world");
  await consumer;

  assertEquals(seen.length, 2);
  assertEquals(seen[0].payload, "hello");
  assertEquals(seen[1].payload, "world");
});

Deno.test("observeStreamFromRig honors pattern filter", async () => {
  const node = stubRig();
  const abort = new AbortController();
  const seen: { uri: string; payload: string | null }[] = [];

  const consumer = (async () => {
    // Only subscribe to stream/ — presence/ should not appear
    for await (const d of observeStreamFromRig(node, "cc-chat://stream/**", abort.signal)) {
      seen.push(d);
      if (seen.length >= 1) abort.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 10));
  // Emit a presence URI first — should NOT surface (pattern won't match)
  await node.receive("cc-chat://presence/alice/20260623-ppp", "join");
  // Emit a stream URI — SHOULD surface
  await node.receive("cc-chat://stream/alice/20260623-aaa", "hi");
  await consumer;

  assertEquals(seen.length, 1);
  assertEquals(seen[0].uri, "cc-chat://stream/alice/20260623-aaa");
});
