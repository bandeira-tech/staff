/**
 * @module
 * staff — URI grammar for chief-of-staff primitives.
 *
 *   <root><resource>/<name>/MAIN.md
 *   <root><resource>/<name>/<ts>-<slug>.md
 *   <root>logs/<ts>-<slug>.md
 *
 * `<root>` is required by every mint helper and never defaulted in this
 * module. The closed MVP resource set is exported as RESOURCES; reserved
 * future segments (positions, teams) live in RESERVED_RESOURCES.
 */

export const RESOURCES = ["staff", "traits", "plays", "logs"] as const;
export type Resource = (typeof RESOURCES)[number];

export const RESERVED_RESOURCES = ["positions", "teams"] as const;
export type ReservedResource = (typeof RESERVED_RESOURCES)[number];

export const MAIN_LEAF = "MAIN.md";

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TS_RE = /^[0-9]{14}$/;
const NONCE_RE = /^[a-z0-9]{6}$/;
const REVISION_LEAF_RE = /^([0-9]{14})-([a-z0-9][a-z0-9-]{0,47})\.md$/;

export function isValidResource(s: string): s is Resource {
  return (RESOURCES as readonly string[]).includes(s);
}

export function isValidName(s: string): boolean { return NAME_RE.test(s); }
export function isValidSlug(s: string): boolean { return SLUG_RE.test(s); }
export function isValidTs(s: string): boolean { return TS_RE.test(s); }
export function isValidNonce(s: string): boolean { return NONCE_RE.test(s); }

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

function requireResource(resource: string): asserts resource is Resource {
  if (!isValidResource(resource)) {
    throw new Error(`invalid resource: ${JSON.stringify(resource)}`);
  }
}

function requireName(name: string): void {
  if (!isValidName(name)) throw new Error(`invalid name: ${JSON.stringify(name)}`);
}

function requireSlug(slug: string): void {
  if (!isValidSlug(slug)) throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
}

export function mainUri(root: string, resource: Resource, name: string): string {
  requireRoot(root);
  requireResource(resource);
  requireName(name);
  return `${root}${resource}/${name}/${MAIN_LEAF}`;
}

export function revisionUri(
  root: string,
  resource: Resource,
  name: string,
  slug: string,
  date?: Date,
): string {
  requireRoot(root);
  requireResource(resource);
  requireName(name);
  requireSlug(slug);
  const ts = formatTs(date ?? new Date());
  return `${root}${resource}/${name}/${ts}-${slug}.md`;
}

export function logUri(root: string, slug: string, date?: Date): string {
  requireRoot(root);
  requireSlug(slug);
  const ts = formatTs(date ?? new Date());
  return `${root}logs/${ts}-${slug}.md`;
}

export type ParsedUri =
  | { kind: "main"; resource: Resource; name: string }
  | { kind: "revision"; resource: Resource; name: string; ts: string; slug: string }
  | { kind: "log"; ts: string; slug: string };

export function parseUri(root: string, uri: string): ParsedUri | null {
  requireRoot(root);
  if (!uri.startsWith(root)) return null;
  const rest = uri.slice(root.length);
  const parts = rest.split("/");

  if (parts.length === 2 && parts[0] === "logs") {
    const m = REVISION_LEAF_RE.exec(parts[1]);
    if (!m) return null;
    return { kind: "log", ts: m[1], slug: m[2] };
  }

  if (parts.length !== 3) return null;
  const [resource, name, leaf] = parts;
  if (!isValidResource(resource)) return null;
  if (!isValidName(name)) return null;
  if (leaf === MAIN_LEAF) return { kind: "main", resource, name };
  const m = REVISION_LEAF_RE.exec(leaf);
  if (!m) return null;
  return { kind: "revision", resource, name, ts: m[1], slug: m[2] };
}

export function validate(root: string, uri: string): void {
  const p = parseUri(root, uri);
  if (!p) throw new Error(`invalid staff URI under ${root}: ${uri}`);
}
