/**
 * @module
 * staff — URI grammar for chief-of-staff primitives.
 *
 *   {root}canon/{kind}/{name}/main.md
 *   {root}canon/{kind}/{name}/gates/{gate}.md
 *   {root}canon/{kind}/{name}/players/{player}/role.ref
 *   {root}canon/{kind}/{name}/players/{player}/gates/{gate}.md
 *   {root}proposal/{kind}/{name}/{ts}/…            (same subtree shapes)
 *   {root}sessions/{name}/{ts}-{main|update|delivery}.md
 *   {root}sessions/{name}/players/{member}/{ts}-{main|update|delivery}.md
 *   {root}sessions/{name}/gates/{gate}.md
 *   {root}sessions/{name}/assets/{path}
 *
 * where {kind} ∈ { traits, roles, plays, teams, staff }. Proposals are
 * timestamped subtrees; promotion materializes canon/ from a chosen
 * proposal. `{root}` is required by every mint helper and never
 * defaulted in this module. Zero imports, by design.
 */

export const KINDS = ["traits", "roles", "plays", "teams", "staff"] as const;
export type Kind = (typeof KINDS)[number];

/** Singular (CLI) and plural (tree) spellings, both mapping to plural. */
export const KIND_ALIASES: Readonly<Record<string, Kind>> = {
  trait: "traits",
  traits: "traits",
  role: "roles",
  roles: "roles",
  play: "plays",
  plays: "plays",
  team: "teams",
  teams: "teams",
  staff: "staff",
};

export const BUCKETS = ["canon", "proposal"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const SESSION_LEAVES = ["main", "update", "delivery"] as const;
export type SessionLeaf = (typeof SESSION_LEAVES)[number];

/** A leaf inside a primitive directory (canon or proposal subtree). */
export type PrimitiveLeaf =
  | { type: "main" }
  | { type: "gate"; gate: string }
  | { type: "player-ref"; player: string }
  | { type: "player-gate"; player: string; gate: string };

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TS_RE = /^[0-9]{14}$/;
const NONCE_RE = /^[a-z0-9]{6}$/;
export const GATE_LEAF_RE = /^([a-z0-9][a-z0-9-]{0,47})\.md$/;
export const SESSION_LEAF_RE = /^([0-9]{14})-(main|update|delivery)\.md$/;
const ASSET_PATH_RE = /^[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)*$/;

export function isValidKind(s: string): s is Kind {
  return (KINDS as readonly string[]).includes(s);
}
export function isValidName(s: string): boolean {
  return NAME_RE.test(s);
}
export function isValidTs(s: string): boolean {
  return TS_RE.test(s);
}
export function isValidNonce(s: string): boolean {
  return NONCE_RE.test(s);
}
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

function requireKind(kind: string): asserts kind is Kind {
  if (!isValidKind(kind)) {
    throw new Error(`invalid kind: ${JSON.stringify(kind)}`);
  }
}

function requireName(label: string, name: string): void {
  if (!isValidName(name)) {
    throw new Error(`invalid ${label}: ${JSON.stringify(name)}`);
  }
}

function requireTs(ts: string): void {
  if (!isValidTs(ts)) throw new Error(`invalid ts: ${JSON.stringify(ts)}`);
}

function leafPath(leaf: PrimitiveLeaf): string {
  switch (leaf.type) {
    case "main":
      return "main.md";
    case "gate":
      requireName("gate", leaf.gate);
      return `gates/${leaf.gate}.md`;
    case "player-ref":
      requireName("player", leaf.player);
      return `players/${leaf.player}/role.ref`;
    case "player-gate":
      requireName("player", leaf.player);
      requireName("gate", leaf.gate);
      return `players/${leaf.player}/gates/${leaf.gate}.md`;
  }
}

/** Canonized primitive leaf — `{root}canon/{kind}/{name}/<leaf>`. */
export function canonUri(
  root: string,
  kind: Kind,
  name: string,
  leaf: PrimitiveLeaf = { type: "main" },
): string {
  requireRoot(root);
  requireKind(kind);
  requireName("name", name);
  return `${root}canon/${kind}/${name}/${leafPath(leaf)}`;
}

/** Proposed primitive leaf — `{root}proposal/{kind}/{name}/{ts}/<leaf>`. */
export function proposalUri(
  root: string,
  kind: Kind,
  name: string,
  ts: string,
  leaf: PrimitiveLeaf = { type: "main" },
): string {
  requireRoot(root);
  requireKind(kind);
  requireName("name", name);
  requireTs(ts);
  return `${root}proposal/${kind}/${name}/${ts}/${leafPath(leaf)}`;
}

/**
 * Session log leaf — `{root}sessions/{session}/{ts}-{leaf}.md`, optionally
 * grouped under `players/{player}/`.
 */
export function sessionLeafUri(
  root: string,
  session: string,
  leaf: SessionLeaf,
  opts?: { player?: string; date?: Date },
): string {
  requireRoot(root);
  requireName("session", session);
  if (!isValidSessionLeaf(leaf)) {
    throw new Error(`invalid session leaf: ${JSON.stringify(leaf)}`);
  }
  const ts = formatTs(opts?.date ?? new Date());
  let mid = "";
  if (opts?.player !== undefined) {
    requireName("player", opts.player);
    mid = `players/${opts.player}/`;
  }
  return `${root}sessions/${session}/${mid}${ts}-${leaf}.md`;
}

/** Session acceptance gate — `{root}sessions/{session}/gates/{gate}.md`. */
export function sessionGateUri(
  root: string,
  session: string,
  gate: string,
): string {
  requireRoot(root);
  requireName("session", session);
  requireName("gate", gate);
  return `${root}sessions/${session}/gates/${gate}.md`;
}

/** Session side-effect file — `{root}sessions/{session}/assets/{path}`. */
export function sessionAssetUri(
  root: string,
  session: string,
  path: string,
): string {
  requireRoot(root);
  requireName("session", session);
  if (!ASSET_PATH_RE.test(path)) {
    throw new Error(`invalid asset path: ${JSON.stringify(path)}`);
  }
  if (path.split("/").some((seg) => seg === "." || seg === "..")) {
    throw new Error(`invalid asset path: ${JSON.stringify(path)}`);
  }
  return `${root}sessions/${session}/assets/${path}`;
}
