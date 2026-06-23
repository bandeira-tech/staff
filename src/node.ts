/**
 * @module
 * PresentChatNode — a `ProtocolInterfaceNode` for present-only chat.
 *
 * Each delivery has a unique URI (`cc-chat://{channel}/{name}/{seq}`)
 * and a UTF-8 payload. The node:
 *
 *   - validates the URI against the cc-chat grammar on `receive`
 *   - decodes Uint8Array payloads to string at the boundary (the HTTP
 *     wire delivers payloads as bytes; in-process callers can send
 *     strings directly)
 *   - stores the payload in a small TTL'd map so `read` can return it
 *     to an observer that just saw the URI
 *   - emits to all observers
 *
 * No archive: payloads expire after `ttlMs` (default 30s) or as soon as
 * the buffer hits `maxEntries`. Read after expiry returns null.
 */
import { ObserveEmitter } from "@bandeira-tech/b3nd-core";
import type {
  Output,
  ProtocolInterfaceNode,
  ReceiveResult,
  StatusResult,
} from "@bandeira-tech/b3nd-core";
import { parseUri } from "./protocol.ts";

export interface PresentChatNodeOptions {
  /** Milliseconds a payload sits in the bridge buffer. Default 30000. */
  ttlMs?: number;
  /** Hard cap on buffer entries — oldest evicted first. Default 4096. */
  maxEntries?: number;
}

interface BufferEntry {
  payload: string;
  expiresAt: number;
}

export class PresentChatNode extends ObserveEmitter
  implements ProtocolInterfaceNode {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly buffer = new Map<string, BufferEntry>();
  private sweepTimer: number | undefined;

  constructor(opts: PresentChatNodeOptions = {}) {
    super();
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.maxEntries = opts.maxEntries ?? 4096;
  }

  // deno-lint-ignore require-await
  async receive(msgs: Output[]): Promise<ReceiveResult[]> {
    const results: ReceiveResult[] = [];
    const now = Date.now();
    for (const [uri, raw] of msgs) {
      const parsed = parseUri(uri);
      if (!parsed) {
        results.push({
          accepted: false,
          error: `invalid cc-chat uri: ${uri}`,
        });
        continue;
      }
      const payload = normalizePayload(raw);
      this.buffer.set(uri, { payload, expiresAt: now + this.ttlMs });
      this.evictOver();
      this._emit(uri, payload);
      results.push({ accepted: true });
    }
    this.ensureSweep();
    return results;
  }

  // deno-lint-ignore require-await
  async read<T = unknown>(locators: string[]): Promise<Output<T>[]> {
    const now = Date.now();
    return locators.map((loc) => {
      const entry = this.buffer.get(loc);
      if (!entry) return [loc, null as unknown as T];
      if (entry.expiresAt <= now) {
        this.buffer.delete(loc);
        return [loc, null as unknown as T];
      }
      return [loc, entry.payload as unknown as T];
    });
  }

  // deno-lint-ignore require-await
  async status(): Promise<StatusResult> {
    return {
      status: "healthy",
      message: "present-chat: ephemeral fanout, no archive",
      details: {
        buffered: this.buffer.size,
        ttlMs: this.ttlMs,
        maxEntries: this.maxEntries,
      },
    };
  }

  /** Stop the periodic sweep so the runtime can exit. */
  close(): void {
    if (this.sweepTimer !== undefined) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    this.buffer.clear();
  }

  private evictOver(): void {
    while (this.buffer.size > this.maxEntries) {
      const firstKey = this.buffer.keys().next().value;
      if (firstKey === undefined) break;
      this.buffer.delete(firstKey);
    }
  }

  private ensureSweep(): void {
    if (this.sweepTimer !== undefined) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.buffer) {
        if (v.expiresAt <= now) this.buffer.delete(k);
      }
      if (this.buffer.size === 0 && this.sweepTimer !== undefined) {
        clearInterval(this.sweepTimer);
        this.sweepTimer = undefined;
      }
    }, Math.max(1000, Math.floor(this.ttlMs / 4)));
    // Deno: prevent the sweep from holding the event loop open.
    if (typeof (Deno as unknown as { unrefTimer?: (n: number) => void })
      .unrefTimer === "function") {
      (Deno as unknown as { unrefTimer: (n: number) => void }).unrefTimer(
        this.sweepTimer,
      );
    }
  }
}

function normalizePayload(raw: unknown): string {
  if (raw instanceof Uint8Array) {
    return new TextDecoder().decode(raw);
  }
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return "";
  return String(raw);
}
