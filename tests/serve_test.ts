/**
 * Serve integration tests — exercise the b3nd HTTP wire end-to-end via
 * `@bandeira-tech/b3nd-move/http/client`.
 *
 * What we prove:
 *   - status round trip
 *   - receive → observe → read delivers the full payload to a remote
 *     observer (the canonical present-chat round trip)
 *   - the web UI HTML loads
 */
import { assert, assertEquals } from "@std/assert";
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import { startServer } from "../src/serve.ts";
import {
  mintStreamUri,
  PATTERN_ALL,
} from "../src/protocol.ts";

Deno.test("status round-trip via HttpClient", async () => {
  const s = startServer({ port: 0 });
  try {
    const client = new HttpClient({ url: s.url });
    const status = await client.status();
    // Rig may report aggregate; we just want non-throw + a status string.
    assert(typeof status.status === "string");
  } finally {
    await s.shutdown();
  }
});

Deno.test("receive → observe → read full round trip", async () => {
  const s = startServer({ port: 0 });
  try {
    const client = new HttpClient({ url: s.url });

    // Start observing first.
    const abort = new AbortController();
    const seenUris: string[] = [];
    const observed = (async () => {
      for await (const batch of client.observe([PATTERN_ALL], abort.signal)) {
        for (const u of batch) seenUris.push(u);
        if (seenUris.length >= 1) abort.abort();
      }
    })();

    // Let the observer install.
    await new Promise((r) => setTimeout(r, 50));

    // Receive a message.
    const uri = mintStreamUri("alice");
    const payload = new TextEncoder().encode("hello from the wire");
    const results = await client.receive([[uri, payload]]);
    assertEquals(results, [{ accepted: true }]);

    await observed;
    assertEquals(seenUris, [uri]);

    // Read back the payload — present-chat returns the buffered text.
    const reads = await client.read([uri]);
    assertEquals(reads.length, 1);
    assertEquals(reads[0][0], uri);
    assertEquals(reads[0][1], "hello from the wire");
  } finally {
    await s.shutdown();
  }
});

Deno.test("invalid URI is reported per-slot, not as a transport error", async () => {
  const s = startServer({ port: 0 });
  try {
    const client = new HttpClient({ url: s.url });
    const payload = new TextEncoder().encode("nope");
    const results = await client.receive([
      ["http://elsewhere", payload],
    ]);
    assertEquals(results.length, 1);
    assertEquals(results[0].accepted, false);
    assert(results[0].error);
  } finally {
    await s.shutdown();
  }
});

Deno.test("web UI is served at /", async () => {
  const s = startServer({ port: 0 });
  try {
    const res = await fetch(`${s.url}/`);
    assertEquals(res.status, 200);
    const ct = res.headers.get("content-type") ?? "";
    assert(ct.startsWith("text/html"));
    const html = await res.text();
    assert(html.includes("cc-chat"));
  } finally {
    await s.shutdown();
  }
});
