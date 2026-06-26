/**
 * @module
 * cc-chat roles — the role-file schema, lookup, and lint.
 *
 * Role files are plain markdown with YAML frontmatter, living at:
 *
 *   <plugin>/skills/cc-chat/roles/<slug>.md   (library, ships with plugin)
 *   <project>/.claude/cc-chat/roles/<slug>.md (project-local override)
 *
 * Project-local override is **full replacement**, not merge. Lookup
 * precedence at dispatch:
 *
 *   1. <project>/.claude/cc-chat/roles/<slug>.md
 *   2. <plugin>/skills/cc-chat/roles/<slug>.md
 *   3. none — participant runs off-the-cuff
 *
 * The body of a role file is interpolated verbatim into the participant
 * prompt (under the identity block, before Step 1). The frontmatter is
 * addressing/provenance/version only; substantive guidance is body prose.
 *
 * See design-spec §3 for the canonical schema.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export type RoleStatus = "active" | "retired-with-note";

export interface RoleFrontmatter {
  slug: string;
  summary: string;
  sourced_from?: string[];
  status?: RoleStatus;
  version?: number;
  updated?: string;
}

export interface RoleFile {
  /** Resolved frontmatter. */
  frontmatter: RoleFrontmatter;
  /** Body (everything after the closing `---`). */
  body: string;
  /** Absolute path the file was loaded from. */
  path: string;
}

export interface LintIssue {
  kind: "error" | "warn";
  message: string;
}

export interface ResolveOptions {
  /** Project root — `<project>/.claude/cc-chat/roles/` is searched first. */
  projectRoot: string;
  /** Plugin root — `<plugin>/skills/cc-chat/roles/` is the fallback. */
  pluginRoot: string;
}

export interface ResolvedRole {
  /** Loaded role file. */
  file: RoleFile;
  /** Which path won — `"local"` (project) or `"plugin"`. */
  source: "local" | "plugin";
}

/** Returns true if a slug is well-formed. */
export function isValidRoleSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/**
 * Parse a role-file body string. Throws on invalid frontmatter; returns
 * a structured {@link RoleFile} otherwise. The `path` field is informational.
 */
export function parseRoleFile(raw: string, path: string): RoleFile {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) {
    throw new Error(
      `role file ${path}: missing YAML frontmatter (expected leading "---\\n...\\n---\\n")`,
    );
  }
  const fm = parseFrontmatter(m[1], path);
  const body = m[2];
  return { frontmatter: fm, body, path };
}

/**
 * Minimal YAML-ish parser for the role-file frontmatter shape. Supports the
 * keys defined in design-spec §3.1; refuses everything else with a clear
 * error so silently-tolerated typos don't drift the schema.
 */
function parseFrontmatter(raw: string, path: string): RoleFrontmatter {
  const out: Partial<RoleFrontmatter> = {};
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.startsWith("#")) { i++; continue; }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) {
      throw new Error(`role file ${path}: malformed frontmatter at line ${i + 1}: ${line}`);
    }
    const key = kv[1];
    let value = kv[2];
    if (value === "") {
      // Block list — collect indented "- " lines that follow.
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, "").trim());
        i++;
      }
      assignKey(out, key, items, path);
      continue;
    }
    assignKey(out, key, value, path);
    i++;
  }
  if (!out.slug) {
    throw new Error(`role file ${path}: frontmatter missing required key "slug"`);
  }
  if (!out.summary) {
    throw new Error(`role file ${path}: frontmatter missing required key "summary"`);
  }
  return out as RoleFrontmatter;
}

function assignKey(
  out: Partial<RoleFrontmatter>,
  key: string,
  value: string | string[],
  path: string,
): void {
  switch (key) {
    case "slug":
      if (typeof value !== "string") throw new Error(`role file ${path}: "slug" must be a string`);
      out.slug = value.trim();
      return;
    case "summary":
      if (typeof value !== "string") throw new Error(`role file ${path}: "summary" must be a string`);
      out.summary = value.trim();
      return;
    case "sourced_from":
      if (!Array.isArray(value)) {
        throw new Error(`role file ${path}: "sourced_from" must be a YAML list`);
      }
      out.sourced_from = value;
      return;
    case "status":
      if (typeof value !== "string") throw new Error(`role file ${path}: "status" must be a string`);
      if (value !== "active" && value !== "retired-with-note") {
        throw new Error(
          `role file ${path}: "status" must be "active" or "retired-with-note", got "${value}"`,
        );
      }
      out.status = value;
      return;
    case "version":
      if (typeof value !== "string") throw new Error(`role file ${path}: "version" must be a scalar`);
      {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`role file ${path}: "version" must be a positive integer, got "${value}"`);
        }
        out.version = n;
      }
      return;
    case "updated":
      if (typeof value !== "string") throw new Error(`role file ${path}: "updated" must be a string`);
      out.updated = value.trim();
      return;
    default:
      throw new Error(
        `role file ${path}: unknown frontmatter key "${key}" (allowed: slug, summary, sourced_from, status, version, updated)`,
      );
  }
}

/**
 * Lint a role file. Returns an array of {@link LintIssue}s (empty = clean).
 * Error issues block; warn issues nudge. See design-spec §3.3 for rules.
 */
export function lintRoleFile(file: RoleFile, expectedSlug?: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const { frontmatter, body, path } = file;

  if (!isValidRoleSlug(frontmatter.slug)) {
    issues.push({
      kind: "error",
      message: `${path}: slug "${frontmatter.slug}" does not match [a-z0-9][a-z0-9-]{0,31}`,
    });
  }
  if (expectedSlug && frontmatter.slug !== expectedSlug) {
    issues.push({
      kind: "error",
      message: `${path}: frontmatter slug "${frontmatter.slug}" does not match filename slug "${expectedSlug}"`,
    });
  }
  if (frontmatter.summary.length > 200) {
    issues.push({
      kind: "error",
      message: `${path}: summary is ${frontmatter.summary.length} chars (max 200)`,
    });
  }
  if (/^# (?!#)/m.test(body)) {
    issues.push({
      kind: "error",
      message: `${path}: body contains a top-level H1 ("# ..."); use H2 ("## ...") to avoid clashing with the participant prompt's own H1`,
    });
  }
  if (body.length > 4000) {
    issues.push({
      kind: "warn",
      message: `${path}: body is ${body.length} chars (soft cap 4000); long role files bloat every participant prompt that summons them`,
    });
  }
  return issues;
}

/**
 * Resolve a role slug to a {@link ResolvedRole} via two-dir lookup, or
 * return `null` if neither path yields a file. Errors propagate from
 * {@link parseRoleFile} when a found file has malformed frontmatter.
 */
export async function resolveRole(
  slug: string,
  opts: ResolveOptions,
): Promise<ResolvedRole | null> {
  if (!isValidRoleSlug(slug)) {
    throw new Error(`resolveRole: invalid slug "${slug}"`);
  }
  const localPath = `${opts.projectRoot}/.claude/cc-chat/roles/${slug}.md`;
  const pluginPath = `${opts.pluginRoot}/skills/cc-chat/roles/${slug}.md`;

  const local = await tryReadFile(localPath);
  if (local !== null) {
    return { file: parseRoleFile(local, localPath), source: "local" };
  }
  const plugin = await tryReadFile(pluginPath);
  if (plugin !== null) {
    return { file: parseRoleFile(plugin, pluginPath), source: "plugin" };
  }
  return null;
}

/** List every role known to a project (local + plugin, deduped by slug). */
export async function listRoles(opts: ResolveOptions): Promise<ResolvedRole[]> {
  const local = await listDir(`${opts.projectRoot}/.claude/cc-chat/roles`);
  const plugin = await listDir(`${opts.pluginRoot}/skills/cc-chat/roles`);
  const seen = new Set<string>();
  const out: ResolvedRole[] = [];
  for (const entry of local) {
    const slug = slugFromFilename(entry.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const raw = await Deno.readTextFile(entry.path);
    out.push({ file: parseRoleFile(raw, entry.path), source: "local" });
  }
  for (const entry of plugin) {
    const slug = slugFromFilename(entry.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const raw = await Deno.readTextFile(entry.path);
    out.push({ file: parseRoleFile(raw, entry.path), source: "plugin" });
  }
  out.sort((a, b) => a.file.frontmatter.slug.localeCompare(b.file.frontmatter.slug));
  return out;
}

/**
 * Render the prompt fragment that the manager interpolates into a
 * participant prompt under the identity block. If `role` is null, returns
 * the empty string (off-the-cuff path; no section is added).
 */
export function renderStandingBrief(role: ResolvedRole | null): string {
  if (role === null) return "";
  const { frontmatter, body, path } = role.file;
  const version = frontmatter.version ? `@v${frontmatter.version}` : "";
  const status = frontmatter.status === "retired-with-note"
    ? " [retired-with-note — body is historical, not active guidance]"
    : "";
  return `\n\nStanding role brief (from ${path}${version})${status}:\n${body.trim()}\n`;
}

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
}

interface DirEntry {
  name: string;
  path: string;
}

async function listDir(dir: string): Promise<DirEntry[]> {
  const out: DirEntry[] = [];
  try {
    for await (const e of Deno.readDir(dir)) {
      if (!e.isFile || !e.name.endsWith(".md")) continue;
      out.push({ name: e.name, path: `${dir}/${e.name}` });
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return [];
    throw e;
  }
  return out;
}

function slugFromFilename(name: string): string | null {
  const m = name.match(/^([a-z0-9][a-z0-9-]{0,31})\.md$/);
  return m ? m[1] : null;
}
