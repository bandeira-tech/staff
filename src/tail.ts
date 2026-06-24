/**
 * @module
 * tail() — async iterator over live cc-chat deliveries on a remote rig.
 * Wraps `ccChatClient.observeStream` and adds a parsed-URI tag per
 * delivery so consumers can switch on type without re-parsing.
 */
import { ccChatClient } from "./client.ts";
import { parseUri, type ParsedUri } from "./protocol.ts";

export interface TailOptions {
  url: string;
  /** URI root, e.g. `immutable://open/cc-chat/`. */
  root?: string;
  /** Subscription pattern, default `${root}**`. */
  pattern?: string;
  signal: AbortSignal;
}

export interface TailDelivery {
  uri: string;
  payload: string | null;
  parsed: ParsedUri | null;
}

export function roomPattern(root: string, room: string): string {
  return `${root}${room}/**`;
}

export function enrichDelivery(root: string, d: { uri: string; payload: string | null }): TailDelivery {
  return { uri: d.uri, payload: d.payload, parsed: parseUri(root, d.uri) };
}

export async function* tail(opts: TailOptions): AsyncIterable<TailDelivery> {
  const client = ccChatClient({ url: opts.url, root: opts.root });
  const pattern = opts.pattern ?? `${client.root}**`;
  for await (const d of client.observeStream(pattern, opts.signal)) {
    yield enrichDelivery(client.root, d);
  }
}
