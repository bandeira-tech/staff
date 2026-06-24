/**
 * @module
 * Client-side cc-chat helpers. Wraps a b3nd-move HTTP client (or any
 * ProtocolInterfaceNode-shaped object — see `observeStreamFromRig`) and
 * exposes a uniform `{ send, read, observeStream }` interface for
 * UIs and CLI tools.
 *
 * `observeStream` drives `HttpClient.observe` — b3nd-move's HTTP wire
 * serves a streamed NDJSON of URI batches; for each batch the helper
 * calls `read` to fetch payloads and yields `Delivery` values. For
 * MCP contexts, agents use the b3nd plugin's MCP tools directly
 * (`resources/subscribe`, `b3nd_read`). If a deployment needs polling,
 * it can call `read` periodically itself — there is no built-in polling
 * fallback here.
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
  /** URI root, e.g. `immutable://open/cc-chat/`. */
  root?: string;
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
        payload: decodePayload(payload),
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
      yield { uri, payload: decodePayload(payload) };
    }
  }
}

// HttpClient.read (b3nd-move ≥0.19) returns `Uint8Array` for flag=1 raw-bytes
// slots and JSON-decoded values for flag=0. cc-chat payloads are UTF-8 text
// minted via TextEncoder, so the bytes branch is decoded as a string here.
function decodePayload(payload: unknown): string | null {
  if (payload == null) return null;
  if (typeof payload === "string") return payload;
  if (payload instanceof Uint8Array) return new TextDecoder().decode(payload);
  return String(payload);
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
