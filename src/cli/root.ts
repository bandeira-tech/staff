/**
 * Root resolution — six-rung ladder from env override to first-run prompt.
 *
 * Resolution order:
 *   1. $STAFF_ROOT (or $STAFF_DATA_DIR for back-compat)
 *   2. Nearest qualifying tree walking UP from cwd — checks staff, Staff, .staff
 *      at each level; qualifies if it contains canon/, proposal/, or sessions/.
 *   3. Registered choice in config (roots map — exact cwd, then nearest ancestor)
 *   4. alwaysUserRoot: true in config → userRoot (default ~/Staff)
 *   5. Interactive prompt (TTY only) — ask once, register, proceed
 *   6. Non-interactive with nothing resolved → throw loud, actionable error
 */

import { loadCliConfig, saveCliConfig } from "./config.ts";

export interface RootResolution {
  root: string;
  origin: "env" | "tree" | "registered" | "user" | "chosen";
}

const TREE_MARKERS = ["canon", "proposal", "sessions"] as const;
const DIR_NAMES = ["staff", "Staff", ".staff"] as const;

/** A directory qualifies as a STAFF tree if it has at least one marker subdir. */
async function qualifies(dirPath: string): Promise<boolean> {
  for (const marker of TREE_MARKERS) {
    try {
      const stat = await Deno.stat(`${dirPath}/${marker}`);
      if (stat.isDirectory) return true;
    } catch { /* not found */ }
  }
  return false;
}

/**
 * Walk up from fromDir, checking staff/Staff/.staff at each level (in that order).
 * Returns the first qualifying candidate, or null if none found.
 */
export async function findUpstreamTree(fromDir: string): Promise<string | null> {
  let current = fromDir;
  while (true) {
    for (const name of DIR_NAMES) {
      const candidate = `${current}/${name}`;
      try {
        const stat = await Deno.stat(candidate);
        if (stat.isDirectory && await qualifies(candidate)) {
          return candidate;
        }
      } catch { /* not found at this level */ }
    }
    const lastSlash = current.lastIndexOf("/");
    if (lastSlash <= 0) break; // at filesystem root
    current = current.slice(0, lastSlash);
  }
  return null;
}

/** Find best registered root for cwd: exact match first, nearest ancestor second. */
function findRegistered(roots: Record<string, string>, cwd: string): string | null {
  if (roots[cwd]) return roots[cwd];
  let bestLen = -1;
  let best: string | null = null;
  for (const [folder, root] of Object.entries(roots)) {
    if (cwd.startsWith(folder + "/") && folder.length > bestLen) {
      bestLen = folder.length;
      best = root;
    }
  }
  return best;
}

/** Create the STAFF tree skeleton — makes step 2 self-detecting on next run. */
export async function createTreeSkeleton(root: string): Promise<void> {
  await Deno.mkdir(`${root}/canon`, { recursive: true });
  await Deno.mkdir(`${root}/proposal`, { recursive: true });
  await Deno.mkdir(`${root}/sessions`, { recursive: true });
}

/**
 * Parse a raw interactive answer into a root path and optional always flag.
 * Pure function — no I/O — so it can be unit-tested without scaffolding.
 *
 * Choices:
 *   1 [always]  → ~/Staff; 'always' sets alwaysUserRoot flag
 *   2           → <cwd>/staff  (public, project-local)
 *   3           → <cwd>/.staff (private, project-local)
 *   4 <path>    → custom abs or relative path (relative resolved from cwd)
 */
export function parseRootChoice(
  answer: string,
  cwd: string,
  home: string,
): { root: string; always?: boolean } {
  const parts = answer.trim().split(/\s+/);
  const choice = parts[0];
  const extra = parts[1];

  switch (choice) {
    case "1":
      return { root: `${home}/Staff`, always: extra === "always" };
    case "2":
      return { root: `${cwd}/staff` };
    case "3":
      return { root: `${cwd}/.staff` };
    case "4": {
      const rest = parts.slice(1).join(" ");
      if (!rest) throw new Error("choice 4 requires a path after '4 '");
      return { root: rest.startsWith("/") ? rest : `${cwd}/${rest}` };
    }
    default:
      throw new Error(
        `invalid choice: ${JSON.stringify(choice)} — expected 1, 2, 3, or 4`,
      );
  }
}

const PROMPT_TEXT =
  "No STAFF root found for this folder.\n" +
  "[1] use your user root ~/Staff\n" +
  "[2] create ./staff here (public)\n" +
  "[3] create ./.staff here (private)\n" +
  "[4] enter a path\n" +
  "(add 'always' after choice 1 to always use the user root)\n" +
  "> ";

async function readStdinLine(): Promise<string> {
  const buf = new Uint8Array(4096);
  let acc = "";
  while (true) {
    const n = await Deno.stdin.read(buf);
    if (n === null) break;
    acc += new TextDecoder().decode(buf.subarray(0, n));
    if (acc.includes("\n")) break;
  }
  return acc.split("\n")[0].trim();
}

async function promptChoice(cwd: string): Promise<RootResolution> {
  const home = Deno.env.get("HOME") ?? "";
  await Deno.stdout.write(new TextEncoder().encode(PROMPT_TEXT));
  const line = await readStdinLine();
  const { root, always } = parseRootChoice(line, cwd, home);

  await createTreeSkeleton(root);

  const config = await loadCliConfig();
  if (always) {
    await saveCliConfig({ ...config, alwaysUserRoot: true });
  } else {
    await saveCliConfig({
      ...config,
      roots: { ...(config.roots ?? {}), [cwd]: root },
    });
  }

  return { root, origin: "chosen" };
}

/**
 * Six-rung root resolution ladder.
 *
 * @param opts.cwd         - starting directory (pass Deno.cwd() in prod)
 * @param opts.interactive - override TTY auto-detect; false = never prompt
 */
export async function resolveRoot(opts: {
  cwd: string;
  interactive?: boolean;
}): Promise<RootResolution> {
  // Step 1: env ($STAFF_ROOT, then $STAFF_DATA_DIR for back-compat).
  // Use || not ?? so an empty-string override (used in tests to suppress
  // a var without losing Deno.Command's process-env inheritance) falls
  // through to the next candidate.
  const envRoot = Deno.env.get("STAFF_ROOT") || Deno.env.get("STAFF_DATA_DIR");
  if (envRoot) return { root: envRoot, origin: "env" };

  // Step 2: nearest qualifying tree walking up from cwd
  const treeRoot = await findUpstreamTree(opts.cwd);
  if (treeRoot) return { root: treeRoot, origin: "tree" };

  // Step 3: registered choice in config
  const config = await loadCliConfig();
  const regRoot = findRegistered(config.roots ?? {}, opts.cwd);
  if (regRoot) return { root: regRoot, origin: "registered" };

  // Step 4: alwaysUserRoot flag
  if (config.alwaysUserRoot) {
    const home = Deno.env.get("HOME") ?? "";
    const userRoot = config.userRoot ?? `${home}/Staff`;
    return { root: userRoot, origin: "user" };
  }

  // Step 5: interactive prompt (TTY only, or explicit override)
  const isInteractive = opts.interactive ??
    (Deno.stdin.isTerminal() && Deno.stdout.isTerminal());
  if (isInteractive) {
    return await promptChoice(opts.cwd);
  }

  // Step 6: fail loud with actionable message
  throw new Error(
    "no STAFF root — set $STAFF_ROOT, run `staff root <path|user>` in this folder, or enable always-user (staff root user --always)",
  );
}
