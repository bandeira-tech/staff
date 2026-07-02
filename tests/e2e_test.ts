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
 * staff's data location and the shell PATH.  STAFF_RIG is deleted so the
 * parent's rig configuration doesn't leak into the subprocess.
 */
async function runStaff(
  args: string[],
  opts: { home: string; stdinText?: string; path?: string },
): Promise<RunResult> {
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    HOME: opts.home,
    STAFF_DATA_DIR: `${opts.home}/fs`,
    PATH: opts.path ?? Deno.env.get("PATH")!,
  };
  delete env.STAFF_RIG;

  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-lock", MAIN, ...args],
    env,
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
});

// ─── 2. full add / gate / list / promote / read battery ─────────────────────

Deno.test("e2e: full add/gate/list/promote/read battery", async () => {
  const home = await Deno.makeTempDir();

  // rig
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

  // add gate
  const addGate = await runStaff(
    ["add", "gate", "trait/skeptical/no-empty-promises", "gate body"],
    { home },
  );
  assertEquals(addGate.code, 0, `add gate stderr: ${addGate.stderr}`);
  assertStringIncludes(addGate.stdout, "gates/no-empty-promises.md");

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
});

// ─── 3. gate usage check fires before stdin is consumed ──────────────────────

Deno.test("e2e: gate usage check fires before stdin is consumed (regression)", async () => {
  const home = await Deno.makeTempDir();
  // `staff add gate` with no path argument should print usage and exit 1
  // WITHOUT consuming stdin and raising "no prose given".
  const r = await runStaff(
    ["add", "gate"],
    { home, stdinText: "prose that must not be consumed" },
  );
  assertEquals(r.code, 1);
  assertStringIncludes(r.stderr, "usage: staff add gate");
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
