/**
 * E2E subprocess tests — exercises the CLI dispatch path by spawning real
 * `deno run` subprocesses, including the claude spawn path via a shim.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";

const MAIN = new URL("../src/cli/main.ts", import.meta.url).pathname;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn `deno run -A --no-lock src/cli/main.ts <args>` in an isolated
 * home directory.  We merge the parent process env (so Deno's module cache
 * and OS-level paths stay intact) then override only the vars that control
 * staff's data location and the shell PATH.  STAFF_RIG and STAFF_ROOT are
 * deleted so the parent's rig/root configuration doesn't leak into the
 * subprocess.  XDG_CONFIG_HOME is isolated to opts.home so developer config
 * never contaminates test runs.
 */
async function runStaff(
  args: string[],
  opts: {
    home: string;
    stdinText?: string;
    path?: string;
    cwd?: string;
    noStaffDataDir?: boolean;
  },
): Promise<RunResult> {
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    HOME: opts.home,
    STAFF_DATA_DIR: `${opts.home}/fs`,
    XDG_CONFIG_HOME: opts.home, // isolate config per-test; overrides any parent value
    PATH: opts.path ?? Deno.env.get("PATH")!,
    // Explicit empty-string overrides beat the process-env inheritance that
    // Deno.Command uses — `delete` on the JS object does NOT unset a var that
    // is already in the spawning process's env (Deno.Command env is additive).
    // resolveRoot uses `||` not `??`, so "" is treated as "not set" and falls
    // through to the next rung in the ladder.
    STAFF_RIG: "",
    STAFF_ROOT: "",
  };
  if (opts.noStaffDataDir) {
    env.STAFF_DATA_DIR = "";
  }

  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-lock", MAIN, ...args],
    env,
    cwd: opts.cwd,
    stdin: opts.stdinText === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  if (opts.stdinText !== undefined) {
    const w = child.stdin.getWriter();
    await w.write(new TextEncoder().encode(opts.stdinText));
    await w.close();
  }
  const { code, stdout, stderr } = await child.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

// ─── 1. help ────────────────────────────────────────────────────────────────

Deno.test("e2e: --help prints usage and exits 0", async () => {
  const home = await Deno.makeTempDir();
  const r = await runStaff(["--help"], { home });
  assertEquals(r.code, 0);
  assertStringIncludes(r.stdout, "staff — Claude as Chief of Staff");
  assertStringIncludes(r.stdout, "staff cast");
  assertStringIncludes(r.stdout, "staff root");
});

// ─── 2. full add / gate / list / promote / read battery ─────────────────────

Deno.test("e2e: full add/gate/list/promote/read battery", async () => {
  const home = await Deno.makeTempDir();

  // rig (env step 1 covers root; confirm no behavior change from T15)
  const rig = await runStaff(["rig"], { home });
  assertEquals(rig.code, 0, `rig stderr: ${rig.stderr}`);
  assertStringIncludes(rig.stdout, "(bundled)");
  assertStringIncludes(rig.stdout, "healthy");

  // add trait
  const add = await runStaff(
    ["add", "trait", "skeptical", "You don't trust..."],
    { home },
  );
  assertEquals(add.code, 0, `add stderr: ${add.stderr}`);
  assert(add.stdout.startsWith("✓ "), `stdout does not start with ✓: ${add.stdout}`);
  assertStringIncludes(add.stdout, "proposal/traits/skeptical/");

  // list trait — one proposal pending, no canon yet
  const list = await runStaff(["list", "trait"], { home });
  assertEquals(list.code, 0, `list stderr: ${list.stderr}`);
  assertStringIncludes(list.stdout, "skeptical");
  assertStringIncludes(list.stdout, "1 proposal(s) pending");

  // promote
  const promote = await runStaff(["promote", "trait", "skeptical"], { home });
  assertEquals(promote.code, 0, `promote stderr: ${promote.stderr}`);
  assertStringIncludes(promote.stdout, "✓ promoted trait/skeptical @");
  assertStringIncludes(promote.stdout, "canon/traits/skeptical/main.md");

  // read canon — body must round-trip exactly
  const read = await runStaff(
    ["read", "canon/traits/skeptical/main.md"],
    { home },
  );
  assertEquals(read.code, 0, `read stderr: ${read.stderr}`);
  assertEquals(read.stdout.trim(), "You don't trust...");

  // add gate — AFTER promote/read on purpose: `add` mints a
  // second-granularity {ts}; a gate added in a different second creates a
  // second proposal subtree, which would flake the "1 proposal(s) pending"
  // assertion and make promote pick a gate-only (main.md-less) subtree on
  // slow runners (observed in CI).
  const addGate = await runStaff(
    ["add", "gate", "trait/skeptical/no-empty-promises", "gate body"],
    { home },
  );
  assertEquals(addGate.code, 0, `add gate stderr: ${addGate.stderr}`);
  assertStringIncludes(addGate.stdout, "gates/no-empty-promises.md");
});

// ─── 3. gate usage check fires before stdin is consumed ──────────────────────

Deno.test("e2e: gate usage check fires before stdin is consumed (regression)", async () => {
  const home = await Deno.makeTempDir();
  // Empty piped stdin is the discriminator: the old ordering read stdin
  // first and died with "no prose given"; the fixed ordering prints the
  // usage error before ever touching stdin.
  const r = await runStaff(["add", "gate"], { home, stdinText: "" });
  assertEquals(r.code, 1);
  assertStringIncludes(r.stderr, "usage: staff add gate");
  assert(
    !r.stderr.includes("no prose given"),
    "stdin was consumed before the path check — ordering regressed",
  );
});

// ─── 4. unknown verb ─────────────────────────────────────────────────────────

Deno.test("e2e: unknown verb exits 1 with message on stderr", async () => {
  const home = await Deno.makeTempDir();
  const r = await runStaff(["bogus"], { home });
  assertEquals(r.code, 1);
  assertStringIncludes(r.stderr, "unknown verb: bogus");
});

// ─── 5. --rig= equals form is consumed and passed to the loader ──────────────

Deno.test("e2e: --rig= equals form reaches the loader", async () => {
  const home = await Deno.makeTempDir();
  // The nonexistent rig must appear in the error; if extractFlag silently
  // dropped the `=` form the error would mention the bundled rig instead.
  const r = await runStaff(
    ["--rig=/nonexistent/rig.ts", "list", "trait"],
    { home },
  );
  assertEquals(r.code, 1);
  assertStringIncludes(r.stderr, "/nonexistent/rig.ts");
});

// ─── 6. cast spawns claude — fake shim ───────────────────────────────────────

Deno.test("e2e: cast spawns claude via a shim and surfaces its output", async () => {
  const home = await Deno.makeTempDir();

  // Write a fake claude shim that echoes its first argument and exits 0.
  const binDir = `${home}/bin`;
  await Deno.mkdir(binDir, { recursive: true });
  const shimPath = `${binDir}/claude`;
  await Deno.writeTextFile(
    shimPath,
    '#!/bin/sh\necho "FAKE_CLAUDE first-arg=$1"\nexit 0\n',
  );
  await Deno.chmod(shimPath, 0o755);

  // Seed: add + promote trait so planCast can resolve the canon ref.
  await runStaff(
    ["add", "trait", "skeptical", "You don't trust..."],
    { home },
  );
  await runStaff(["promote", "trait", "skeptical"], { home });

  const r = await runStaff(
    ["cast", "trait", "skeptical", "--session", "smoke"],
    { home, path: `${binDir}:${Deno.env.get("PATH")}` },
  );
  assertEquals(r.code, 0, `cast stderr: ${r.stderr}`);
  assertStringIncludes(r.stdout, "FAKE_CLAUDE first-arg=--append-system-prompt");
  assertStringIncludes(r.stdout, "session closed with exit code 0");
});

// ─── 7. cast errors gracefully when claude is not on PATH ────────────────────

Deno.test("e2e: cast errors when claude binary is not on PATH", async () => {
  const home = await Deno.makeTempDir();

  // An empty bin dir — no claude binary.  Deno itself is invoked by absolute
  // path so PATH-poverty doesn't affect the subprocess launch.
  const emptybin = `${home}/emptybin`;
  await Deno.mkdir(emptybin, { recursive: true });

  // Seed
  await runStaff(
    ["add", "trait", "skeptical", "You don't trust..."],
    { home },
  );
  await runStaff(["promote", "trait", "skeptical"], { home });

  const r = await runStaff(
    ["cast", "trait", "skeptical", "--session", "smoke"],
    { home, path: emptybin },
  );
  assertEquals(r.code, 1);
  assertStringIncludes(r.stderr, "claude binary not found on PATH");
});

// ─── 8. transparent tree — path is URI ───────────────────────────────────────

Deno.test("e2e: transparent tree — path is URI (b3nd-save 0.13 regression guard)", async () => {
  const home = await Deno.makeTempDir();
  // runStaff sets STAFF_DATA_DIR = ${home}/fs
  const dataDir = `${home}/fs`;

  // add trait
  const add = await runStaff(
    ["add", "trait", "skeptical", "You don't trust..."],
    { home },
  );
  assertEquals(add.code, 0, `add stderr: ${add.stderr}`);

  // Parse the URI from the output line: "✓ immutable://open/staff/proposal/…"
  const wireUri = add.stdout.trim().replace(/^✓ /, "");
  assert(
    wireUri.startsWith("immutable://open/staff/"),
    `unexpected URI: ${wireUri}`,
  );
  const storePath = wireUri.slice("immutable://open/staff/".length);

  // The proposal must exist as a PLAIN file at ${dataDir}/${storePath} —
  // no .bin suffix, no immutable_open/ prefix — with the prose verbatim.
  let content: string;
  try {
    content = await Deno.readTextFile(`${dataDir}/${storePath}`);
  } catch {
    throw new Error(
      `transparent-tree: file not found at ${dataDir}/${storePath}\n` +
        `  (add output was: ${add.stdout.trim()})`,
    );
  }
  assertEquals(
    content,
    "You don't trust...",
    "proposal file content must round-trip exactly",
  );

  // .b3nd/ store bookkeeping must exist under the data dir (dot-prefixed)
  const b3ndStat = await Deno.stat(`${dataDir}/.b3nd`);
  assert(b3ndStat.isDirectory, ".b3nd/ must be a directory");

  // promote
  const promote = await runStaff(["promote", "trait", "skeptical"], { home });
  assertEquals(promote.code, 0, `promote stderr: ${promote.stderr}`);

  // canon/traits/skeptical/main.md must exist as a plain markdown file
  const canonContent = await Deno.readTextFile(
    `${dataDir}/canon/traits/skeptical/main.md`,
  );
  assertEquals(
    canonContent,
    "You don't trust...",
    "canon file content must round-trip exactly",
  );

  // No immutable_open/ directory may exist (old layout is gone)
  let oldLayoutExists = false;
  try {
    await Deno.stat(`${dataDir}/immutable_open`);
    oldLayoutExists = true;
  } catch { /* expected — old dir must not exist */ }
  assert(!oldLayoutExists, "immutable_open/ must not exist in the transparent tree");
});

// ─── 9. root: non-interactive fail → exit 1 with guidance ───────────────────

Deno.test("e2e: staff root non-interactive (null stdin) prints guidance and exits 1", async () => {
  const home = await Deno.makeTempDir();
  const bareDir = await Deno.makeTempDir();
  // noStaffDataDir + no tree in bareDir → step 6 fail
  const r = await runStaff(["root"], {
    home,
    cwd: bareDir,
    noStaffDataDir: true,
  });
  assertEquals(r.code, 1, `stdout: ${r.stdout}`);
  assertStringIncludes(r.stderr, "no STAFF root");
  assertStringIncludes(r.stderr, "$STAFF_ROOT");
  assertStringIncludes(r.stderr, "staff root");
});

// ─── 10. root: upstream tree walk resolves via cwd ──────────────────────────

Deno.test("e2e: staff root finds qualifying tree via upstream walk", async () => {
  const home = await Deno.makeTempDir();
  const proj = await Deno.makeTempDir();

  // Create a qualifying tree at proj/staff/canon
  await Deno.mkdir(`${proj}/staff/canon`, { recursive: true });
  // Run from proj/sub — tree is one level up
  await Deno.mkdir(`${proj}/sub`, { recursive: true });

  const r = await runStaff(["root"], {
    home,
    cwd: `${proj}/sub`,
    noStaffDataDir: true,
  });
  assertEquals(r.code, 0, `stderr: ${r.stderr}`);
  assertStringIncludes(r.stdout, `${proj}/staff`);
  assertStringIncludes(r.stdout, "tree");
});

// ─── 11. root walk: staff add writes into the tree-resolved root ─────────────

Deno.test("e2e: staff add writes into tree-resolved root (no STAFF_DATA_DIR)", async () => {
  const home = await Deno.makeTempDir();
  const proj = await Deno.makeTempDir();

  // Qualifying tree one level above sub/
  await Deno.mkdir(`${proj}/staff/canon`, { recursive: true });
  await Deno.mkdir(`${proj}/sub`, { recursive: true });

  const r = await runStaff(
    ["add", "trait", "walk-smoke", "walk body"],
    { home, cwd: `${proj}/sub`, noStaffDataDir: true },
  );
  assertEquals(r.code, 0, `stderr: ${r.stderr}`);
  assertStringIncludes(r.stdout, "✓ ");

  // The file must live under proj/staff/proposal/traits/walk-smoke/{ts}/main.md
  const traitsDir = `${proj}/staff/proposal/traits/walk-smoke`;
  let found = false;
  for await (const entry of Deno.readDir(traitsDir)) {
    try {
      const body = await Deno.readTextFile(
        `${traitsDir}/${entry.name}/main.md`,
      );
      if (body === "walk body") found = true;
    } catch { /* skip */ }
  }
  assertEquals(found, true, "proposal file not found under proj/staff/");
});

// ─── 12. staff list (bare) — all-kinds overview, 4 per kind ──────────────────

Deno.test("e2e: bare staff list shows overview of all kinds, 4 per kind", async () => {
  const home = await Deno.makeTempDir();

  // Seed: five traits (t1..t5) in alphabetical order, plus one role.
  for (let i = 1; i <= 5; i++) {
    const r = await runStaff(
      ["add", "trait", `t${i}`, `body ${i}`],
      { home },
    );
    assertEquals(r.code, 0, `add t${i} stderr: ${r.stderr}`);
  }

  const roleR = await runStaff(
    ["add", "role", "lead-qa", "qa role body"],
    { home },
  );
  assertEquals(roleR.code, 0, `add role stderr: ${roleR.stderr}`);

  // `staff list` (bare) — should show overview
  const overview = await runStaff(["list"], { home });
  assertEquals(overview.code, 0, `overview stderr: ${overview.stderr}`);

  // Must include section headers
  assertStringIncludes(overview.stdout, "traits:");
  assertStringIncludes(overview.stdout, "roles:");
  assertStringIncludes(overview.stdout, "plays:");

  // Must include t1 and t4 (first 4 traits alphabetically)
  assertStringIncludes(overview.stdout, "t1");
  assertStringIncludes(overview.stdout, "t4");

  // Must NOT include t5 (fifth trait, truncated)
  assert(
    !overview.stdout.includes("t5"),
    "t5 should not appear in overview (>4 shown)",
  );

  // Must include the drill-down hint
  assertStringIncludes(
    overview.stdout,
    "… and 1 more — staff list trait",
  );

  // Must include lead-qa
  assertStringIncludes(overview.stdout, "lead-qa");

  // Empty kinds should show (none)
  assertStringIncludes(overview.stdout, "(none)");

  // `staff list trait` (full path) — should include t5
  const full = await runStaff(["list", "trait"], { home });
  assertEquals(full.code, 0, `full stderr: ${full.stderr}`);
  assertStringIncludes(full.stdout, "t5");
});
