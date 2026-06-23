/**
 * @module
 * tail() — async iterator over live cc-chat deliveries on a remote rig.
 *
 * Wraps the b3nd-move HTTP client's observe + read pattern into a single
 * async iterable of `{ uri, payload }` pairs. Used by the `tail.sh` /
 * `bnd-cc-chat tail` CLI and by tests.
 */
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";

export interface TailOptions {
  /** Rig base URL. e.g. http://127.0.0.1:7373 */
  url: string;
  /** Subscription pattern. Default cc-chat://** */
  pattern?: string;
  /** Abort to stop. */
  signal: AbortSignal;
}

export interface TailDelivery {
  uri: string;
  payload: string | null;
}

export async function* tail(
  opts: TailOptions,
): AsyncIterable<TailDelivery> {
  const client = new HttpClient({ url: opts.url });
  const pattern = opts.pattern ?? "cc-chat://**";

  for await (const batch of client.observe([pattern], opts.signal)) {
    if (batch.length === 0) continue;
    const reads = await client.read([...batch]);
    for (const [uri, payload] of reads) {
      yield { uri, payload: (payload ?? null) as string | null };
    }
  }
}
