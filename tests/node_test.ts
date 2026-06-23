/**
 * Node tests — PresentChatNode end-to-end.
 */
import { assert, assertEquals } from "@std/assert";
import { PresentChatNode } from "../src/node.ts";
import {
  mintPresenceUri,
  mintStreamUri,
  PATTERN_ALL,
  PATTERN_PRESENCE_ALL,
} from "../src/protocol.ts";

Deno.test("receive a valid stream message returns accepted", async () => {
  const node = new PresentChatNode();
  try {
    const uri = mintStreamUri("alice");
    const results = await node.receive([[uri, "hello"]]);
    assertEquals(results, [{ accepted: true }]);
  } finally {
    node.close();
  }
});

Deno.test("receive rejects URIs outside cc-chat scheme", async () => {
  const node = new PresentChatNode();
  try {
    const results = await node.receive([["http://elsewhere", "x"]]);
    assertEquals(results.length, 1);
    assertEquals(results[0].accepted, false);
    assert(results[0].error);
  } finally {
    node.close();
  }
});

Deno.test("receive rejects malformed cc-chat URIs", async () => {
  const node = new PresentChatNode();
  try {
    const results = await node.receive([["cc-chat://stream/Bad/seq", "hi"]]);
    assertEquals(results[0].accepted, false);
  } finally {
    node.close();
  }
});

Deno.test("receive normalizes Uint8Array payloads (HTTP wire shape)", async () => {
  const node = new PresentChatNode();
  try {
    const uri = mintStreamUri("alice");
    const bytes = new TextEncoder().encode("from the wire");
    await node.receive([[uri, bytes]]);
    const outs = await node.read([uri]);
    assertEquals(outs[0][1], "from the wire");
  } finally {
    node.close();
  }
});

Deno.test("read returns the buffered payload for a recent delivery", async () => {
  const node = new PresentChatNode();
  try {
    const uri = mintStreamUri("alice");
    await node.receive([[uri, "msg one"]]);
    const outs = await node.read([uri]);
    assertEquals(outs, [[uri, "msg one"]]);
  } finally {
    node.close();
  }
});

Deno.test("read returns null for an unknown URI", async () => {
  const node = new PresentChatNode();
  try {
    const uri = mintStreamUri("ghost");
    const outs = await node.read([uri]);
    assertEquals(outs, [[uri, null]]);
  } finally {
    node.close();
  }
});

Deno.test("read returns null after TTL expiry (no history)", async () => {
  const node = new PresentChatNode({ ttlMs: 20 });
  try {
    const uri = mintStreamUri("alice");
    await node.receive([[uri, "ephemeral"]]);
    await new Promise((r) => setTimeout(r, 40));
    const outs = await node.read([uri]);
    assertEquals(outs[0][1], null);
  } finally {
    node.close();
  }
});

Deno.test("observe yields the URI of a fresh delivery", async () => {
  const node = new PresentChatNode();
  try {
    const abort = new AbortController();
    const seen: string[] = [];
    const task = (async () => {
      for await (const uris of node.observe([PATTERN_ALL], abort.signal)) {
        for (const u of uris) seen.push(u);
        if (seen.length >= 1) abort.abort();
      }
    })();
    await new Promise((r) => setTimeout(r, 5));
    const uri = mintStreamUri("alice");
    await node.receive([[uri, "hi"]]);
    await task;
    assertEquals(seen, [uri]);
  } finally {
    node.close();
  }
});

Deno.test("observe fans out to multiple observers", async () => {
  const node = new PresentChatNode();
  try {
    const abortA = new AbortController();
    const abortB = new AbortController();
    const a: string[] = [];
    const b: string[] = [];
    const taskA = (async () => {
      for await (const uris of node.observe([PATTERN_ALL], abortA.signal)) {
        for (const u of uris) a.push(u);
        if (a.length) abortA.abort();
      }
    })();
    const taskB = (async () => {
      for await (const uris of node.observe([PATTERN_ALL], abortB.signal)) {
        for (const u of uris) b.push(u);
        if (b.length) abortB.abort();
      }
    })();
    await new Promise((r) => setTimeout(r, 5));
    const uri = mintPresenceUri("alice");
    await node.receive([[uri, "join"]]);
    await taskA;
    await taskB;
    assertEquals(a, [uri]);
    assertEquals(b, [uri]);
  } finally {
    node.close();
  }
});

Deno.test("observe ignores deliveries emitted before subscription", async () => {
  const node = new PresentChatNode();
  try {
    await node.receive([[mintStreamUri("alice"), "ghost"]]);
    const abort = new AbortController();
    const seen: string[] = [];
    const task = (async () => {
      for await (const uris of node.observe([PATTERN_ALL], abort.signal)) {
        for (const u of uris) seen.push(u);
      }
    })();
    await new Promise((r) => setTimeout(r, 20));
    abort.abort();
    await task;
    assertEquals(seen, []);
  } finally {
    node.close();
  }
});

Deno.test("observe respects locator pattern filtering", async () => {
  const node = new PresentChatNode();
  try {
    const abort = new AbortController();
    const seen: string[] = [];
    const task = (async () => {
      for await (
        const uris of node.observe([PATTERN_PRESENCE_ALL], abort.signal)
      ) {
        for (const u of uris) seen.push(u);
      }
    })();
    await new Promise((r) => setTimeout(r, 5));
    await node.receive([[mintStreamUri("alice"), "hi"]]);
    const pUri = mintPresenceUri("alice");
    await node.receive([[pUri, "join"]]);
    await new Promise((r) => setTimeout(r, 10));
    abort.abort();
    await task;
    assertEquals(seen, [pUri]);
  } finally {
    node.close();
  }
});

Deno.test("status returns healthy with buffer details", async () => {
  const node = new PresentChatNode({ ttlMs: 1234, maxEntries: 100 });
  try {
    const s = await node.status();
    assertEquals(s.status, "healthy");
    assertEquals(s.details?.ttlMs, 1234);
    assertEquals(s.details?.maxEntries, 100);
  } finally {
    node.close();
  }
});
