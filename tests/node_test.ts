/**
 * Node tests — PresentChatNode end-to-end.
 *
 * The node is a ProtocolInterfaceNode that:
 *   - emits on receive (no storage)
 *   - returns nothing on read (no history)
 *   - fans out to all current observers
 *   - stops cleanly on abort
 *   - reports healthy status
 */
import { assert, assertEquals } from "@std/assert";
import { PresentChatNode } from "../src/node.ts";
import { presenceUri, streamUri } from "../src/protocol.ts";

Deno.test("receive a valid stream message returns accepted", async () => {
  const node = new PresentChatNode();
  const results = await node.receive([[streamUri("alice"), "hello"]]);
  assertEquals(results.length, 1);
  assertEquals(results[0].accepted, true);
});

Deno.test("receive rejects URIs outside the cc-chat scheme", async () => {
  const node = new PresentChatNode();
  const results = await node.receive([["http://elsewhere", "x"]]);
  assertEquals(results.length, 1);
  assertEquals(results[0].accepted, false);
  assert(results[0].error);
});

Deno.test("receive rejects malformed cc-chat URIs", async () => {
  const node = new PresentChatNode();
  const results = await node.receive([["cc-chat://stream/Bad Name", "hi"]]);
  assertEquals(results[0].accepted, false);
});

Deno.test("read always returns empty payloads (no history)", async () => {
  const node = new PresentChatNode();
  await node.receive([[streamUri("alice"), "msg one"]]);
  await node.receive([[streamUri("alice"), "msg two"]]);
  const outs = await node.read([streamUri("alice")]);
  assertEquals(outs.length, 1);
  assertEquals(outs[0][0], streamUri("alice"));
  assertEquals(outs[0][1], null);
});

Deno.test("observe receives a message emitted after subscription", async () => {
  const node = new PresentChatNode();
  const abort = new AbortController();
  const received: string[] = [];

  const task = (async () => {
    for await (const uris of node.observe(["cc-chat://**"], abort.signal)) {
      for (const u of uris) received.push(u);
      if (received.length >= 1) abort.abort();
    }
  })();

  // Yield to let the observer install its listener.
  await new Promise((r) => setTimeout(r, 5));
  await node.receive([[streamUri("alice"), "hello"]]);
  await task;

  assertEquals(received, [streamUri("alice")]);
});

Deno.test("observe fans out to multiple observers (each gets the message)", async () => {
  const node = new PresentChatNode();
  const abortA = new AbortController();
  const abortB = new AbortController();
  const a: string[] = [];
  const b: string[] = [];

  const taskA = (async () => {
    for await (const uris of node.observe(["cc-chat://**"], abortA.signal)) {
      for (const u of uris) a.push(u);
      if (a.length >= 1) abortA.abort();
    }
  })();
  const taskB = (async () => {
    for await (const uris of node.observe(["cc-chat://**"], abortB.signal)) {
      for (const u of uris) b.push(u);
      if (b.length >= 1) abortB.abort();
    }
  })();

  await new Promise((r) => setTimeout(r, 5));
  await node.receive([[presenceUri("alice"), "join"]]);
  await taskA;
  await taskB;

  assertEquals(a, [presenceUri("alice")]);
  assertEquals(b, [presenceUri("alice")]);
});

Deno.test("observe ignores messages emitted before subscription (no history)", async () => {
  const node = new PresentChatNode();
  await node.receive([[streamUri("alice"), "ghost"]]);

  const abort = new AbortController();
  const received: string[] = [];
  const task = (async () => {
    for await (const uris of node.observe(["cc-chat://**"], abort.signal)) {
      for (const u of uris) received.push(u);
    }
  })();

  // Give the observer time to install, then abort without any new receive.
  await new Promise((r) => setTimeout(r, 20));
  abort.abort();
  await task;

  assertEquals(received, []);
});

Deno.test("observe respects locator pattern filtering", async () => {
  const node = new PresentChatNode();
  const abort = new AbortController();
  const received: string[] = [];

  const task = (async () => {
    for await (
      const uris of node.observe(["cc-chat://presence/**"], abort.signal)
    ) {
      for (const u of uris) received.push(u);
    }
  })();

  await new Promise((r) => setTimeout(r, 5));
  await node.receive([[streamUri("alice"), "hi"]]); // should NOT match
  await node.receive([[presenceUri("alice"), "join"]]); // should match
  await new Promise((r) => setTimeout(r, 10));
  abort.abort();
  await task;

  assertEquals(received, [presenceUri("alice")]);
});

Deno.test("status returns healthy", async () => {
  const node = new PresentChatNode();
  const s = await node.status();
  assertEquals(s.status, "healthy");
});
