/**
 * @module
 * staff — URI grammar for chief-of-staff primitives.
 *
 *   <root><card>/<name>/MAIN.md
 *   <root><card>/<name>/<ts>-<slug>.md
 *   <root>sessions/<ts>-<session>/<leaf>.md         leaf ∈ {MAIN, LEDGER, REPORT}
 *
 * where <card> ∈ { staff, traits, plays }. Sessions carry their own
 * shape: a time-prefixed name plus a closed set of canonical leaves.
 *
 * `<root>` is required by every mint helper and never defaulted in
 * this module. The closed MVP resource set is exported as RESOURCES;
 * reserved future segments (positions, teams) live in
 * RESERVED_RESOURCES.
 */

export const RESOURCES = ["staff", "traits", "plays", "sessions"] as const;
export type Resource = (typeof RESOURCES)[number];

export const CARD_RESOURCES = ["staff", "traits", "plays"] as const;
export type CardResource = (typeof CARD_RESOURCES)[number];

export const RESERVED_RESOURCES = ["positions", "teams"] as const;
export type ReservedResource = (typeof RESERVED_RESOURCES)[number];

export const SESSION_LEAVES = ["MAIN", "LEDGER", "REPORT"] as const;
export type SessionLeaf = (typeof SESSION_LEAVES)[number];

export const MAIN_LEAF = "MAIN.md";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TS_RE = /^[0-9]{14}$/;
const NONCE_RE = /^[a-z0-9]{6}$/;
const SESSION_ID_RE = /^([0-9]{14})-([a-z0-9][a-z0-9-]{0,47})$/;
const REVISION_LEAF_RE = /^([0-9]{14})-([a-z0-9][a-z0-9-]{0,47})\.md$/;
const SESSION_LEAF_RE = /^(MAIN|LEDGER|REPORT)\.md$/;

export function isValidResource(s: string): s is Resource {
  return (RESOURCES as readonly string[]).includes(s);
}

export function isValidCardResource(s: string): s is CardResource {
  return (CARD_RESOURCES as readonly string[]).includes(s);
}

export function isValidName(s: string): boolean { return NAME_RE.test(s); }
export function isValidSlug(s: string): boolean { return SLUG_RE.test(s); }
export function isValidTs(s: string): boolean { return TS_RE.test(s); }
export function isValidNonce(s: string): boolean { return NONCE_RE.test(s); }
export function isValidSessionId(s: string): boolean { return SESSION_ID_RE.test(s); }
export function isValidSessionLeaf(s: string): s is SessionLeaf {
  return (SESSION_LEAVES as readonly string[]).includes(s);
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

/**
 * Mint a session id of the form `<ts>-<slug>`. `<ts>` defaults to now.
 */
export function mintSessionId(slug: string, date?: Date): string {
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
  return `${formatTs(date ?? new Date())}-${slug}`;
}

function requireRoot(root: string): void {
  if (!root) throw new Error("root is required");
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(root)) {
    throw new Error(`root must be a valid URI prefix: ${root}`);
  }
  if (!root.endsWith("/")) throw new Error(`root must end with '/': ${root}`);
}

function requireCardResource(resource: string): asserts resource is CardResource {
  if (!isValidCardResource(resource)) {
    throw new Error(`invalid card resource: ${JSON.stringify(resource)}`);
  }
}

function requireName(name: string): void {
  if (!isValidName(name)) throw new Error(`invalid name: ${JSON.stringify(name)}`);
}

function requireSlug(slug: string): void {
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
}

function requireSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`invalid session id: ${JSON.stringify(sessionId)}`);
  }
}

function requireSessionLeaf(leaf: string): asserts leaf is SessionLeaf {
  if (!isValidSessionLeaf(leaf)) {
    throw new Error(`invalid session leaf: ${JSON.stringify(leaf)}`);
  }
}

/**
 * Card URI — `<root><card>/<name>/MAIN.md`. For staff, traits, plays.
 */
export function mainUri(root: string, resource: CardResource, name: string): string {
  requireRoot(root);
  requireCardResource(resource);
  requireName(name);
  return `${root}${resource}/${name}/${MAIN_LEAF}`;
}

/**
 * Sibling revision URI under a card — `<root><card>/<name>/<ts>-<slug>.md`.
 */
export function revisionUri(
  root: string,
  resource: CardResource,
  name: string,
  slug: string,
  date?: Date,
): string {
  requireRoot(root);
  requireCardResource(resource);
  requireName(name);
  requireSlug(slug);
  const ts = formatTs(date ?? new Date());
  return `${root}${resource}/${name}/${ts}-${slug}.md`;
}

/**
 * Session URI — `<root>sessions/<sessionId>/<leaf>.md`.
 * `sessionId` is `<ts>-<slug>` (mint via `mintSessionId`).
 * `leaf` ∈ SESSION_LEAVES.
 */
export function sessionUri(
  root: string,
  sessionId: string,
  leaf: SessionLeaf,
): string {
  requireRoot(root);
  requireSessionId(sessionId);
  requireSessionLeaf(leaf);
  return `${root}sessions/${sessionId}/${leaf}.md`;
}

export type ParsedUri =
  | { kind: "main"; resource: CardResource; name: string }
  | { kind: "revision"; resource: CardResource; name: string; ts: string; slug: string }
  | { kind: "session"; sessionId: string; ts: string; slug: string; leaf: SessionLeaf };

export function parseUri(root: string, uri: string): ParsedUri | null {
  requireRoot(root);
  if (!uri.startsWith(root)) return null;
  const rest = uri.slice(root.length);
  const parts = rest.split("/");
  if (parts.length !== 3) return null;
  const [head, mid, leafStr] = parts;

  // sessions/<sessionId>/<LEAF>.md
  if (head === "sessions") {
    const sm = SESSION_ID_RE.exec(mid);
    if (!sm) return null;
    const lm = SESSION_LEAF_RE.exec(leafStr);
    if (!lm) return null;
    return {
      kind: "session",
      sessionId: mid,
      ts: sm[1],
      slug: sm[2],
      leaf: lm[1] as SessionLeaf,
    };
  }

  // <card>/<name>/{MAIN.md | <ts>-<slug>.md}
  if (!isValidCardResource(head)) return null;
  if (!isValidName(mid)) return null;
  if (leafStr === MAIN_LEAF) {
    return { kind: "main", resource: head, name: mid };
  }
  const rm = REVISION_LEAF_RE.exec(leafStr);
  if (!rm) return null;
  return { kind: "revision", resource: head, name: mid, ts: rm[1], slug: rm[2] };
}

export function validate(root: string, uri: string): void {
  const p = parseUri(root, uri);
  if (!p) throw new Error(`invalid staff URI under ${root}: ${uri}`);
}
