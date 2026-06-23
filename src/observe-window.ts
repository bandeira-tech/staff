/**
 * @module
 * observeWindow — block for N seconds, collect URIs that fire under
 * `pattern`, fetch their payloads, return them as one list.
 *
 * Used by the MCP server's `cc_chat_observe` and `cc_chat_who` tools.
 * Pure rig interactions — no transport awareness. Test it against any
 * `ProtocolInterfaceNode`-shaped object.
 *
 * rosterFromObserved derives the participant set from a list of
 * deliveries — useful for "who's here?" UI/agent queries.
 */
import type { ProtocolInterfaceNode } from "@bandeira-tech/b3nd-core";

export interface ObservedDelivery {
  uri: string;
  payload: string | null;
}

/**
 * Listen on `pattern` for `seconds` seconds (fractional allowed),
 * collect every URI that fires, then fetch its payload via `read`.
 * Returns `{uri, payload}[]` in the order URIs first appeared.
 */
export async function observeWindow(
  rig: ProtocolInterfaceNode,
  pattern: string,
  seconds: number,
): Promise<ObservedDelivery[]> {
  const seen: string[] = [];
  const seenSet = new Set<string>();
  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(),
    Math.max(1, Math.floor(seconds * 1000)),
  );

  try {
    for await (const batch of rig.observe([pattern], abort.signal)) {
      for (const uri of batch) {
        if (!seenSet.has(uri)) {
          seenSet.add(uri);
          seen.push(uri);
        }
      }
    }
  } catch (_e) {
    // abort closes the iterator; ignore
  } finally {
    clearTimeout(timer);
  }

  if (seen.length === 0) return [];
  const reads = await rig.read(seen);
  return reads.map(([uri, payload]) => ({
    uri,
    payload: (payload ?? null) as string | null,
  }));
}

export interface Roster {
  /** All distinct names heard, sorted. */
  names: string[];
  /** Names that fired at least one stream URI. */
  speaking: string[];
  /** Names that fired at least one presence URI. */
  presence: string[];
}

const URI_RE = /^cc-chat:\/\/(stream|presence)\/([a-z0-9][a-z0-9-]{0,31})\//;

/** Derive a sorted participant roster from an observation window. */
export function rosterFromObserved(deliveries: ObservedDelivery[]): Roster {
  const speakingSet = new Set<string>();
  const presenceSet = new Set<string>();
  for (const { uri } of deliveries) {
    const m = URI_RE.exec(uri);
    if (!m) continue;
    const [, channel, name] = m;
    if (channel === "stream") speakingSet.add(name);
    else if (channel === "presence") presenceSet.add(name);
  }
  const namesSet = new Set<string>([...speakingSet, ...presenceSet]);
  return {
    names: [...namesSet].sort(),
    speaking: [...speakingSet].sort(),
    presence: [...presenceSet].sort(),
  };
}
