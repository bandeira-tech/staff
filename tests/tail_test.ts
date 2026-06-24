/**
 * Tests for observeStreamFromRig — the in-process equivalent of tail().
 * Covers the same behaviors the original tail_test.ts covered (yields
 * deliveries, honors pattern filter) without needing an HTTP server.
 *
 * Also covers roomPattern() and demonstrates that parseUri() correctly
 * tags the new-grammar URIs emitted by the protocol helpers.
 */
import { assertEquals } from "@std/assert";
import { observeStreamFromRig } from "../src/client.ts";
import { ObserveEmitter } from "@bandeira-tech/b3nd-core";
import { msgUri, joinUri, parseUri } from "../src/protocol.ts";
import { roomPattern, enrichDelivery } from "../src/tail.ts";

const ROOT = "immutable://open/cc-chat/";
const ROOM = "20260623120000-test";

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

  const aliceUri = msgUri(ROOT, ROOM, "alice", "hello");
  const bobUri = msgUri(ROOT, ROOM, "bob", "world-msg");

  const consumer = (async () => {
    for await (const d of observeStreamFromRig(node, `${ROOT}**`, abort.signal)) {
      seen.push(d);
      if (seen.length >= 2) abort.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 10));
  await node.receive(aliceUri, "hello");
  await node.receive(bobUri, "world");
  await consumer;

  assertEquals(seen.length, 2);
  assertEquals(seen[0].payload, "hello");
  assertEquals(seen[1].payload, "world");
});

Deno.test("observeStreamFromRig honors pattern filter", async () => {
  const node = stubRig();
  const abort = new AbortController();
  const seen: { uri: string; payload: string | null }[] = [];

  const joinedUri = joinUri(ROOT, ROOM, "alice");
  const msggedUri = msgUri(ROOT, ROOM, "alice", "hi-there");

  const consumer = (async () => {
    // Only subscribe to msg — join should not appear
    for await (const d of observeStreamFromRig(node, `${ROOT}${ROOM}/alice/msg/**`, abort.signal)) {
      seen.push(d);
      if (seen.length >= 1) abort.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 10));
  // Emit a join URI first — should NOT surface (pattern won't match)
  await node.receive(joinedUri, "join");
  // Emit a msg URI — SHOULD surface
  await node.receive(msggedUri, "hi");
  await consumer;

  assertEquals(seen.length, 1);
  assertEquals(seen[0].uri, msggedUri);
});

Deno.test("observeStreamFromRig yields URIs parseable as new grammar", async () => {
  const node = stubRig();
  const abort = new AbortController();

  const uri = msgUri(ROOT, ROOM, "alice", "test-slug");

  const consumer = (async () => {
    for await (const d of observeStreamFromRig(node, `${ROOT}**`, abort.signal)) {
      const parsed = parseUri(ROOT, d.uri);
      assertEquals(parsed?.type, "msg");
      abort.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 10));
  await node.receive(uri, "content");
  await consumer;
});

Deno.test("roomPattern builds <root><room>/**", () => {
  assertEquals(
    roomPattern("immutable://open/cc-chat/", "20260624120000-r"),
    "immutable://open/cc-chat/20260624120000-r/**",
  );
});

Deno.test("enrichDelivery parses a msg URI", () => {
  const root = ROOT;
  const uri = msgUri(root, ROOM, "alice", "test-msg");
  const delivery = enrichDelivery(root, { uri, payload: "hello" });
  assertEquals(delivery.uri, uri);
  assertEquals(delivery.payload, "hello");
  assertEquals(delivery.parsed?.type, "msg");
});

Deno.test("enrichDelivery returns null for unparseable URI", () => {
  const root = ROOT;
  const unparseable = "https://invalid/not/a/valid/uri";
  const delivery = enrichDelivery(root, { uri: unparseable, payload: null });
  assertEquals(delivery.uri, unparseable);
  assertEquals(delivery.payload, null);
  assertEquals(delivery.parsed, null);
});
