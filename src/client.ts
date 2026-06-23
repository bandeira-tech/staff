/**
 * @module
 * Client-side cc-chat helpers. Wraps a b3nd-move HTTP client (or any
 * ProtocolInterfaceNode-shaped object — see `observeStreamFromRig`) and
 * exposes a uniform `{ send, read, status, observeStream }` interface for
 * UIs and CLI tools.
 *
 * The fallback chain implemented here is what makes cc-chat work over any
 * transport:
 *   1. `observe` — preferred. b3nd-move's HTTP wire serves a streamed
 *      NDJSON of URI batches; we yield each as the transport emits it.
 *   2. (in MCP contexts) `resources/subscribe` — same idea, different
 *      transport. Out of scope for this HTTP-client wrapper; agents use
 *      the b3nd plugin's MCP tools directly.
 *   3. Polling `read` — last resort, only when neither stream is
 *      available. Off by default; opt in with `pollMs`.
 *
 * No server-side observe variants. cc-chat-specific behavior — block-and-
 * collect, roster derivation — lives in client-only helpers (see
 * `roster.ts`).
 */
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import type { StatusResult } from "@bandeira-tech/b3nd-core";

/**
 * Structural subset of ProtocolInterfaceNode: only the methods this module
 * actually calls. Lets tests pass a stub without a full rig implementation.
 */
export interface ObserveReadNode {
  observe(
    patterns: string[],
    signal: AbortSignal,
  ): AsyncIterable<readonly string[] | string[]>;
  read(uris: string[]): Promise<[string, string | null][]>;
}

// Re-export StatusResult so callers don't need a second import when they
// want to type the status() method return value.
export type { StatusResult };

export interface CcChatClientOpts {
  /** Target rig base URL, e.g. http://127.0.0.1:7373 */
  url: string;
  /** URI root, e.g. `cc-chat://`. Default `cc-chat://`. */
  root?: string;
  /** Optional polling fallback interval in ms. If unset, no polling. */
  pollMs?: number;
}

export interface Delivery {
  uri: string;
  payload: string | null;
}

export interface CcChatClient {
  readonly url: string;
  readonly root: string;
  send(uri: string, payload: string): Promise<{ accepted: boolean; error?: string }>;
  read(uris: string[]): Promise<Delivery[]>;
  observeStream(pattern: string, signal: AbortSignal): AsyncIterable<Delivery>;
}

export function ccChatClient(opts: CcChatClientOpts): CcChatClient {
  const http = new HttpClient({ url: opts.url });
  const root = opts.root ?? "cc-chat://";
  return {
    url: opts.url,
    root,
    async send(uri, payload) {
      const [res] = await http.receive([[uri, new TextEncoder().encode(payload)]]);
      return { accepted: res.accepted, error: res.error };
    },
    async read(uris) {
      const outs = await http.read([...uris]);
      return outs.map(([uri, payload]) => ({
        uri,
        payload: typeof payload === "string" ? payload : (payload == null ? null : String(payload)),
      }));
    },
    observeStream(pattern, signal) {
      return observeStreamFromHttp(http, pattern, signal);
    },
  };
}

async function* observeStreamFromHttp(
  http: HttpClient,
  pattern: string,
  signal: AbortSignal,
): AsyncIterable<Delivery> {
  for await (const batch of http.observe([pattern], signal)) {
    if (batch.length === 0) continue;
    const reads = await http.read([...batch]);
    for (const [uri, payload] of reads) {
      const p = typeof payload === "string" ? payload : (payload == null ? null : String(payload));
      yield { uri, payload: p };
    }
  }
}

/**
 * In-process variant for tests and embedded usage. Drives any
 * ObserveReadNode-shaped object that supports `observe` + `read`.
 * Compatible with ProtocolInterfaceNode (a strict superset).
 */
export async function* observeStreamFromRig(
  rig: ObserveReadNode,
  pattern: string,
  signal: AbortSignal,
): AsyncIterable<Delivery> {
  for await (const batch of rig.observe([pattern], signal)) {
    if (batch.length === 0) continue;
    const reads = await rig.read([...batch]);
    for (const [uri, payload] of reads) {
      const p = typeof payload === "string" ? payload : (payload == null ? null : String(payload));
      yield { uri, payload: p };
    }
  }
}
