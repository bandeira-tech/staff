/**
 * tail() — the in-process loop the CLI uses.
 *
 * Smoke-tests the tail iterator against a live serve() instance, proving
 * deliveries land in the iterator within one round-trip.
 */
import { assert, assertEquals } from "@std/assert";
import { startServer } from "../src/serve.ts";
import { tail } from "../src/tail.ts";
import { mintStreamUri } from "../src/protocol.ts";
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";

Deno.test("tail yields {uri, payload} for live deliveries", async () => {
  const s = startServer({ port: 0 });
  try {
    const abort = new AbortController();
    const seen: Array<{ uri: string; payload: string | null }> = [];

    const task = (async () => {
      for await (const d of tail({ url: s.url, signal: abort.signal })) {
        seen.push(d);
        if (seen.length >= 2) abort.abort();
      }
    })();

    await new Promise((r) => setTimeout(r, 80));

    const sender = new HttpClient({ url: s.url });
    const u1 = mintStreamUri("alice");
    const u2 = mintStreamUri("alice");
    await sender.receive([
      [u1, new TextEncoder().encode("first")],
      [u2, new TextEncoder().encode("second")],
    ]);

    await task;

    const uris = seen.map((d) => d.uri).sort();
    assertEquals(uris, [u1, u2].sort());
    const payloads = seen.map((d) => d.payload).sort();
    assertEquals(payloads, ["first", "second"]);
  } finally {
    await s.shutdown();
  }
});

Deno.test("tail honors a pattern filter", async () => {
  const s = startServer({ port: 0 });
  try {
    const abort = new AbortController();
    const seen: Array<{ uri: string; payload: string | null }> = [];
    const task = (async () => {
      for await (
        const d of tail({
          url: s.url,
          pattern: "cc-chat://presence/**",
          signal: abort.signal,
        })
      ) {
        seen.push(d);
        if (seen.length >= 1) abort.abort();
      }
    })();
    await new Promise((r) => setTimeout(r, 80));

    const sender = new HttpClient({ url: s.url });
    await sender.receive([[mintStreamUri("noise"), new TextEncoder().encode("ignored")]]);
    await sender.receive([[
      "cc-chat://presence/x/20260623120000-abc123",
      new TextEncoder().encode("join"),
    ]]);

    await task;

    assertEquals(seen.length, 1);
    assert(seen[0].uri.startsWith("cc-chat://presence/"));
  } finally {
    await s.shutdown();
  }
});
