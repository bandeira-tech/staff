/**
 * @module
 * PresentChatNode — a `ProtocolInterfaceNode` for present-only chat.
 *
 * Behavior:
 *  - `receive` validates each URI against the cc-chat grammar, then
 *    emits to observers. No storage. Invalid URIs are reported per-output
 *    in the `ReceiveResult[]`.
 *  - `read` is a polite no-op: returns one `[locator, null]` per input.
 *    There is no history; nothing to read.
 *  - `observe` is the inherited `ObserveEmitter.observe` — pattern match
 *    over emitted URIs, no replay, abort to stop.
 *  - `status` returns healthy.
 */
import { ObserveEmitter } from "@bandeira-tech/b3nd-core";
import type {
  Output,
  ProtocolInterfaceNode,
  ReceiveResult,
  StatusResult,
} from "@bandeira-tech/b3nd-core";
import { parseUri } from "./protocol.ts";

export class PresentChatNode extends ObserveEmitter
  implements ProtocolInterfaceNode {
  // deno-lint-ignore require-await
  async receive(msgs: Output[]): Promise<ReceiveResult[]> {
    const results: ReceiveResult[] = [];
    for (const [uri, payload] of msgs) {
      const parsed = parseUri(uri);
      if (!parsed) {
        results.push({
          accepted: false,
          error: `invalid cc-chat uri: ${uri}`,
        });
        continue;
      }
      this._emit(uri, payload);
      results.push({ accepted: true });
    }
    return results;
  }

  // deno-lint-ignore require-await
  async read<T = unknown>(locators: string[]): Promise<Output<T>[]> {
    // No history. Each locator gets an empty payload (null) — callers
    // see the same shape as a "not found".
    return locators.map(
      (l) => [l, null as unknown as T] as Output<T>,
    );
  }

  // deno-lint-ignore require-await
  async status(): Promise<StatusResult> {
    return {
      status: "healthy",
      message: "present-chat: no history; observe to participate",
    };
  }
}
