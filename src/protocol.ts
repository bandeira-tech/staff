/**
 * @module
 * cc-chat — present-only chat protocol.
 *
 * URI vocabulary (every delivery has a unique URI):
 *
 *   cc-chat://stream/{name}/{seq}      payload: utf-8 message body
 *   cc-chat://presence/{name}/{seq}    payload: "join" | "leave"
 *
 *   {name} is [a-z0-9][a-z0-9-]{0,31}
 *   {seq}  is {ts}-{nonce} — a 14-char UTC YYYYMMDDhhmmss timestamp
 *                            plus 6 base32-ish characters of randomness.
 *
 * Unique-per-delivery URIs let the b3nd observe/read split work:
 * observe yields the URI, read returns the payload from a tiny TTL
 * buffer in the node, then the entry expires. There is no archive —
 * if you weren't observing, you missed the URI.
 *
 * All payloads are plain UTF-8 text. No JSON envelope.
 */

export const CHANNEL_STREAM = "stream" as const;
export const CHANNEL_PRESENCE = "presence" as const;
export type Channel = typeof CHANNEL_STREAM | typeof CHANNEL_PRESENCE;

export const PRESENCE_JOIN = "join";
export const PRESENCE_LEAVE = "leave";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const TS_RE = /^[0-9]{14}$/;
const NONCE_RE = /^[a-z0-9]{6}$/;
const SEQ_RE = /^([0-9]{14})-([a-z0-9]{6})$/;

/** True iff the input is a valid cc-chat participant name. */
export function isValidName(name: string): boolean {
  return NAME_RE.test(name);
}
export function isValidTs(ts: string): boolean {
  return TS_RE.test(ts);
}
export function isValidNonce(n: string): boolean {
  return NONCE_RE.test(n);
}
export function isValidSeq(seq: string): boolean {
  return SEQ_RE.test(seq);
}

function requireName(name: string): void {
  if (!isValidName(name)) {
    throw new Error(`invalid cc-chat name: ${JSON.stringify(name)}`);
  }
}

/** Format a Date as YYYYMMDDhhmmss in UTC. */
export function formatTs(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(date.getUTCFullYear()) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

/** Generate a 6-char base32-style nonce. */
export function mintNonce(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Build `{ts}-{nonce}`. */
export function mintSeq(date: Date = new Date()): string {
  return `${formatTs(date)}-${mintNonce()}`;
}

function requireRoot(root: string): string {
  if (!root) throw new Error("root is required");
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(root)) {
    throw new Error(
      `root must be a valid URI prefix (e.g. 'cc-chat://'): ${root}`,
    );
  }
  if (!root.endsWith("/")) {
    throw new Error(`root must end with '/', got: ${root}`);
  }
  return root;
}

/** Build a unique stream URI for a delivery from `name`. */
export function mintStreamUri(root: string, name: string, date?: Date): string {
  requireRoot(root);
  requireName(name);
  return `${root}${CHANNEL_STREAM}/${name}/${mintSeq(date)}`;
}

/** Build a unique presence URI for a delivery from `name`. */
export function mintPresenceUri(
  root: string,
  name: string,
  date?: Date,
): string {
  requireRoot(root);
  requireName(name);
  return `${root}${CHANNEL_PRESENCE}/${name}/${mintSeq(date)}`;
}

/** Discriminated parse of a cc-chat URI. */
export type ParsedUri =
  | { channel: "stream"; name: string; seq: string; ts: string; nonce: string }
  | { channel: "presence"; name: string; seq: string; ts: string; nonce: string };

/**
 * Parse a URI under the given root. Returns null when the URI does
 * not start with root, or has an unrecognized shape.
 */
export function parseUri(root: string, uri: string): ParsedUri | null {
  requireRoot(root);
  if (!uri.startsWith(root)) return null;
  const rest = uri.slice(root.length);
  const parts = rest.split("/");
  if (parts.length !== 3) return null;
  const [channel, name, seq] = parts;
  if (!isValidName(name)) return null;
  const m = SEQ_RE.exec(seq);
  if (!m) return null;
  const [, ts, nonce] = m;
  if (channel === CHANNEL_STREAM) {
    return { channel: "stream", name, seq, ts, nonce };
  }
  if (channel === CHANNEL_PRESENCE) {
    return { channel: "presence", name, seq, ts, nonce };
  }
  return null;
}

