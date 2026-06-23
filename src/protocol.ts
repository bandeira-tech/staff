/**
 * @module
 * cc-chat — present-only chat protocol.
 *
 * URI vocabulary:
 *
 *   cc-chat://stream/{name}      payload: utf-8 message body
 *   cc-chat://presence/{name}    payload: "join" | "leave"
 *
 * `{name}` is [a-z0-9][a-z0-9-]{0,31}.
 *
 * All payloads are plain UTF-8 text. There is no JSON envelope. There
 * is no history — payloads exist in flight and are forgotten after
 * fanout.
 */

export const SCHEME = "cc-chat://" as const;

export const CHANNEL_STREAM = "stream" as const;
export const CHANNEL_PRESENCE = "presence" as const;

export type Channel = typeof CHANNEL_STREAM | typeof CHANNEL_PRESENCE;

/** Presence payload values. */
export const PRESENCE_JOIN = "join";
export const PRESENCE_LEAVE = "leave";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** True iff the input is a valid cc-chat participant name. */
export function isValidName(name: string): boolean {
  return NAME_RE.test(name);
}

function requireName(name: string): void {
  if (!isValidName(name)) {
    throw new Error(`invalid cc-chat name: ${JSON.stringify(name)}`);
  }
}

/** Build the URI for a message from `name`. */
export function streamUri(name: string): string {
  requireName(name);
  return `${SCHEME}${CHANNEL_STREAM}/${name}`;
}

/** Build the URI for a presence event from `name`. */
export function presenceUri(name: string): string {
  requireName(name);
  return `${SCHEME}${CHANNEL_PRESENCE}/${name}`;
}

/** Discriminated parse of a cc-chat URI. */
export type ParsedUri =
  | { kind: "stream"; name: string }
  | { kind: "presence"; name: string };

/**
 * Parse a URI under the cc-chat scheme. Returns null when the URI does
 * not belong to this protocol or has an unrecognized shape.
 */
export function parseUri(uri: string): ParsedUri | null {
  if (!uri.startsWith(SCHEME)) return null;
  const rest = uri.slice(SCHEME.length);
  const parts = rest.split("/");
  if (parts.length !== 2) return null;
  const [channel, name] = parts;
  if (!name || !isValidName(name)) return null;
  if (channel === CHANNEL_STREAM) return { kind: "stream", name };
  if (channel === CHANNEL_PRESENCE) return { kind: "presence", name };
  return null;
}
