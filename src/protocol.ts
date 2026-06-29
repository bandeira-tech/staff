/**
 * @module
 * staff — URI grammar for chief-of-staff primitives.
 *
 *   <root><card>/<name>/main.md                       (card primitives)
 *   <root><card>/<name>/<ts>-<slug>.md                (sibling timestamped notes)
 *   <root>sessions/<name>/<ts>-<leaf>.md              (leaf ∈ {main, update, delivery})
 *
 * where <card> ∈ { traits, roles, plays, teams, staff }. All six primitives
 * are first-class — there is no "reserved" set. Sessions carry their own
 * shape: a plain-slug directory plus per-leaf timestamped files. Each
 * session can have many updates and one or more deliveries.
 *
 * `<root>` is required by every mint helper and never defaulted in
 * this module. The closed primitive set is exported as RESOURCES.
 */

export const RESOURCES = [
  "traits",
  "roles",
  "plays",
  "teams",
  "staff",
  "sessions",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const CARD_RESOURCES = [
  "traits",
  "roles",
  "plays",
  "teams",
  "staff",
] as const;
export type CardResource = (typeof CARD_RESOURCES)[number];

export const SESSION_LEAVES = ["main", "update", "delivery"] as const;
export type SessionLeaf = (typeof SESSION_LEAVES)[number];

export const MAIN_LEAF = "main.md";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TS_RE = /^[0-9]{14}$/;
const NONCE_RE = /^[a-z0-9]{6}$/;
const REVISION_LEAF_RE = /^([0-9]{14})-([a-z0-9][a-z0-9-]{0,47})\.md$/;
const SESSION_LEAF_RE = /^([0-9]{14})-(main|update|delivery)\.md$/;

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

function requireSessionLeaf(leaf: string): asserts leaf is SessionLeaf {
  if (!isValidSessionLeaf(leaf)) {
    throw new Error(`invalid session leaf: ${JSON.stringify(leaf)}`);
  }
}

/**
 * Card URI — `<root><card>/<name>/main.md`. For traits, roles, plays,
 * teams, staff.
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
 * Session URI — `<root>sessions/<sessionName>/<ts>-<leaf>.md`.
 *
 * `sessionName` is a plain slug (`[a-z0-9][a-z0-9-]{0,47}`); the
 * timestamp lives on the leaf, not the directory. Each `<ts>-<leaf>.md`
 * is a distinct file: many updates and (in principle) many deliveries
 * are valid.
 */
export function sessionUri(
  root: string,
  sessionName: string,
  leaf: SessionLeaf,
  date?: Date,
): string {
  requireRoot(root);
  requireName(sessionName);
  requireSessionLeaf(leaf);
  const ts = formatTs(date ?? new Date());
  return `${root}sessions/${sessionName}/${ts}-${leaf}.md`;
}

export type ParsedUri =
  | { kind: "main"; resource: CardResource; name: string }
  | { kind: "revision"; resource: CardResource; name: string; ts: string; slug: string }
  | { kind: "session"; sessionName: string; ts: string; leaf: SessionLeaf };

export function parseUri(root: string, uri: string): ParsedUri | null {
  requireRoot(root);
  if (!uri.startsWith(root)) return null;
  const rest = uri.slice(root.length);
  const parts = rest.split("/");
  if (parts.length !== 3) return null;
  const [head, mid, leafStr] = parts;

  // sessions/<name>/<ts>-<leaf>.md
  if (head === "sessions") {
    if (!isValidName(mid)) return null;
    const lm = SESSION_LEAF_RE.exec(leafStr);
    if (!lm) return null;
    return {
      kind: "session",
      sessionName: mid,
      ts: lm[1],
      leaf: lm[2] as SessionLeaf,
    };
  }

  // <card>/<name>/{main.md | <ts>-<slug>.md}
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
