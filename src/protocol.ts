/**
 * @module
 * cc-chat — unified URI grammar for worker-room coordinations.
 *
 *   <root>/<room>/<participant>/<type>/<ts>-<slug>.md
 *   <root>/<room>/meta.md                          (room identity card)
 *
 *   <room>        is <ts>-<slug>, ts = 14-char UTC YYYYMMDDhhmmss,
 *                 slug = [a-z0-9][a-z0-9-]{0,47}
 *   <participant> is [a-z0-9][a-z0-9-]{0,31}
 *   <type>        ∈ { join, msg, pause, resume, end, mention, output }
 *   <slug> on the leaf is [a-z0-9][a-z0-9-]{0,47} or a 6-char base32 nonce
 *
 * Manager-only types: pause, resume, output, and room-closing end.
 * Mention carries a target: <from>/mention/<target>/<ts>-<slug>.md
 *
 * The rig is expected to be backed by persistent storage; meta.md and
 * output must remain readable after their post moment.
 */

export const TYPES = [
  "join", "msg", "pause", "resume", "end", "mention", "output",
] as const;
export type CcChatType = typeof TYPES[number];

export const MANAGER_ONLY_TYPES = ["pause", "resume", "output"] as const;
export type ManagerOnlyType = typeof MANAGER_ONLY_TYPES[number];

export const MANAGER_NAME = "manager";
export const META_LEAF = "meta.md";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TS_RE = /^[0-9]{14}$/;
const NONCE_RE = /^[a-z0-9]{6}$/;
const ROOM_RE = /^([0-9]{14})-([a-z0-9][a-z0-9-]{0,47})$/;
const LEAF_RE = /^([0-9]{14})-([a-z0-9]{6}|[a-z0-9][a-z0-9-]{0,47})\.(md|json)$/;

export function isValidName(name: string): boolean { return NAME_RE.test(name); }
export function isValidSlug(s: string): boolean { return SLUG_RE.test(s); }
export function isValidTs(s: string): boolean { return TS_RE.test(s); }
export function isValidNonce(s: string): boolean { return NONCE_RE.test(s); }
export function isValidRoom(s: string): boolean { return ROOM_RE.test(s); }
export function isValidType(s: string): s is CcChatType {
  return (TYPES as readonly string[]).includes(s);
}
export function isManagerOnly(t: string): t is ManagerOnlyType {
  return (MANAGER_ONLY_TYPES as readonly string[]).includes(t);
}

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

export function mintNonce(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function mintRoom(slug: string, date: Date = new Date()): string {
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
  return `${formatTs(date)}-${slug}`;
}

function requireRoot(root: string): void {
  if (!root) throw new Error("root is required");
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(root)) {
    throw new Error(`root must be a valid URI prefix: ${root}`);
  }
  if (!root.endsWith("/")) throw new Error(`root must end with '/': ${root}`);
}

function requireRoom(room: string): void {
  if (!isValidRoom(room)) throw new Error(`invalid room: ${JSON.stringify(room)}`);
}

function requireName(name: string): void {
  if (!isValidName(name)) throw new Error(`invalid name: ${JSON.stringify(name)}`);
}

function leaf(date: Date | undefined, slugOrNonce: string, ext: "md" | "json"): string {
  const d = date ?? new Date();
  return `${formatTs(d)}-${slugOrNonce}.${ext}`;
}

export function metaUri(root: string, room: string): string {
  requireRoot(root); requireRoom(room);
  return `${root}${room}/${META_LEAF}`;
}

export function joinUri(root: string, room: string, who: string, date?: Date): string {
  requireRoot(root); requireRoom(room); requireName(who);
  return `${root}${room}/${who}/join/${leaf(date, mintNonce(), "json")}`;
}

export function msgUri(root: string, room: string, who: string, slug: string, date?: Date): string {
  requireRoot(root); requireRoom(room); requireName(who);
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${slug}`);
  return `${root}${room}/${who}/msg/${leaf(date, slug, "md")}`;
}

export function pauseUri(root: string, room: string, date?: Date): string {
  requireRoot(root); requireRoom(room);
  return `${root}${room}/${MANAGER_NAME}/pause/${leaf(date, mintNonce(), "md")}`;
}

export function resumeUri(root: string, room: string, date?: Date): string {
  requireRoot(root); requireRoom(room);
  return `${root}${room}/${MANAGER_NAME}/resume/${leaf(date, mintNonce(), "md")}`;
}

export function endUri(root: string, room: string, who: string, date?: Date): string {
  requireRoot(root); requireRoom(room); requireName(who);
  return `${root}${room}/${who}/end/${leaf(date, mintNonce(), "md")}`;
}

export function mentionUri(
  root: string, room: string, from: string, to: string, slug: string, date?: Date,
): string {
  requireRoot(root); requireRoom(room); requireName(from); requireName(to);
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${slug}`);
  return `${root}${room}/${from}/mention/${to}/${leaf(date, slug, "md")}`;
}

export function outputUri(root: string, room: string, slug: string, date?: Date): string {
  requireRoot(root); requireRoom(room);
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${slug}`);
  return `${root}${room}/${MANAGER_NAME}/output/${leaf(date, slug, "md")}`;
}

export type ParsedUri =
  | { type: "meta"; room: string }
  | { type: "join"; room: string; who: string; ts: string; nonce: string }
  | { type: "msg"; room: string; who: string; ts: string; slug: string }
  | { type: "pause"; room: string; who: string; ts: string; nonce: string }
  | { type: "resume"; room: string; who: string; ts: string; nonce: string }
  | { type: "end"; room: string; who: string; ts: string; nonce: string }
  | { type: "mention"; room: string; who: string; target: string; ts: string; slug: string }
  | { type: "output"; room: string; who: string; ts: string; slug: string };

export function parseUri(root: string, uri: string): ParsedUri | null {
  requireRoot(root);
  if (!uri.startsWith(root)) return null;
  const rest = uri.slice(root.length);
  const parts = rest.split("/");

  // <room>/meta.md
  if (parts.length === 2 && parts[1] === META_LEAF) {
    if (!isValidRoom(parts[0])) return null;
    return { type: "meta", room: parts[0] };
  }

  // <room>/<who>/<type>/<leaf>  or  <room>/<who>/mention/<target>/<leaf>
  if (parts.length < 4) return null;
  const [room, who, type] = parts;
  if (!isValidRoom(room)) return null;
  if (!isValidName(who)) return null;
  if (!isValidType(type)) return null;

  if (type === "mention") {
    if (parts.length !== 5) return null;
    const [, , , target, leafStr] = parts;
    if (!isValidName(target)) return null;
    const m = LEAF_RE.exec(leafStr);
    if (!m) return null;
    const [, ts, sn] = m;
    return { type: "mention", room, who, target, ts, slug: sn };
  }

  if (parts.length !== 4) return null;
  const leafStr = parts[3];
  const m = LEAF_RE.exec(leafStr);
  if (!m) return null;
  const [, ts, sn] = m;

  switch (type) {
    case "join":
    case "pause":
    case "resume":
    case "end":
      return { type, room, who, ts, nonce: sn } as ParsedUri;
    case "msg":
    case "output":
      return { type, room, who, ts, slug: sn } as ParsedUri;
  }
  return null;
}

export function validate(root: string, uri: string): void {
  const p = parseUri(root, uri);
  if (!p) throw new Error(`invalid cc-chat URI under ${root}: ${uri}`);
  if (p.type === "meta") return;
  if (isManagerOnly(p.type) && p.who !== MANAGER_NAME) {
    throw new Error(`manager-only type ${p.type} minted by non-manager: ${uri}`);
  }
}
