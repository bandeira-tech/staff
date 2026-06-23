/**
 * @module
 * tail() — async iterator over live cc-chat deliveries on a remote rig.
 * Thin wrapper over `ccChatClient.observeStream` so the CLI and tests
 * share one path. No transport-specific code here.
 */
import { ccChatClient } from "./client.ts";

export interface TailOptions {
  url: string;
  /** URI root, default `cc-chat://`. */
  root?: string;
  /** Subscription pattern, default `${root}**`. */
  pattern?: string;
  signal: AbortSignal;
}

export interface TailDelivery {
  uri: string;
  payload: string | null;
}

export async function* tail(opts: TailOptions): AsyncIterable<TailDelivery> {
  const client = ccChatClient({ url: opts.url, root: opts.root });
  const pattern = opts.pattern ?? `${client.root}**`;
  for await (const d of client.observeStream(pattern, opts.signal)) {
    yield d;
  }
}
