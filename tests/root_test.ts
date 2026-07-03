/**
 * Unit tests for src/cli/root.ts — ladder logic, qualifier heuristic,
 * parseRootChoice, and resolveRoot ordering.
 *
 * Env isolation: each test sets XDG_CONFIG_HOME and HOME to a fresh temp dir
 * so no developer config leaks in, and STAFF_ROOT/STAFF_DATA_DIR are deleted.
 */

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  createTreeSkeleton,
  findUpstreamTree,
  parseRootChoice,
  resolveRoot,
} from "../src/cli/root.ts";

// ─── env helpers ──────────────────────────────────────────────────────────────

function clearRootEnv() {
  Deno.env.delete("STAFF_ROOT");
  Deno.env.delete("STAFF_DATA_DIR");
}

function isolateConfig(tmp: string) {
  Deno.env.set("XDG_CONFIG_HOME", tmp);
  Deno.env.set("HOME", tmp);
}

// ─── findUpstreamTree ─────────────────────────────────────────────────────────

Deno.test("findUpstreamTree: staff/ with canon/ qualifies", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj/staff/canon`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    assertEquals(r, `${tmp}/proj/staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: staff/ with proposal/ qualifies", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj/staff/proposal`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    assertEquals(r, `${tmp}/proj/staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: staff/ with sessions/ qualifies", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj/staff/sessions`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    assertEquals(r, `${tmp}/proj/staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: staff/ without any marker dirs does NOT qualify", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj/staff/other`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    assertEquals(r, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: .staff found when staff absent", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj/.staff/sessions`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    assertEquals(r, `${tmp}/proj/.staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: Staff/ (capital) qualifies", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj/Staff/canon`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    // On case-insensitive FS (macOS) the probe "staff" hits "Staff/" so the
    // returned path uses the probed name rather than the disk capitalisation.
    // Accept either form.
    assertEquals(
      r?.toLowerCase(),
      `${tmp}/proj/Staff`.toLowerCase(),
      `expected proj/Staff or proj/staff, got: ${r}`,
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: staff beats .staff at same level (priority order)", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj/staff/canon`, { recursive: true });
    await Deno.mkdir(`${tmp}/proj/.staff/canon`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    assertEquals(r, `${tmp}/proj/staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: nearest level wins over ancestor", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/staff/canon`, { recursive: true });
    await Deno.mkdir(`${tmp}/sub/proj/staff/canon`, { recursive: true });
    // start from sub/proj — nearest is sub/proj/staff
    const r = await findUpstreamTree(`${tmp}/sub/proj`);
    assertEquals(r, `${tmp}/sub/proj/staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: walks up when none at start level", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/staff/sessions`, { recursive: true });
    await Deno.mkdir(`${tmp}/sub/proj`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/sub/proj`);
    assertEquals(r, `${tmp}/staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("findUpstreamTree: returns null when nothing found", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${tmp}/proj`, { recursive: true });
    const r = await findUpstreamTree(`${tmp}/proj`);
    assertEquals(r, null);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ─── parseRootChoice ──────────────────────────────────────────────────────────

Deno.test("parseRootChoice: choice 1 → user root ~/Staff", () => {
  const r = parseRootChoice("1", "/proj", "/home/user");
  assertEquals(r.root, "/home/user/Staff");
  assertEquals(r.always, false);
});

Deno.test("parseRootChoice: choice 1 always → always flag set", () => {
  const r = parseRootChoice("1 always", "/proj", "/home/user");
  assertEquals(r.root, "/home/user/Staff");
  assertEquals(r.always, true);
});

Deno.test("parseRootChoice: choice 2 → ./staff (public)", () => {
  const r = parseRootChoice("2", "/proj", "/home/user");
  assertEquals(r.root, "/proj/staff");
  assertEquals(r.always, undefined);
});

Deno.test("parseRootChoice: choice 3 → ./.staff (private)", () => {
  const r = parseRootChoice("3", "/proj", "/home/user");
  assertEquals(r.root, "/proj/.staff");
});

Deno.test("parseRootChoice: choice 4 abs path", () => {
  const r = parseRootChoice("4 /custom/path", "/proj", "/home/user");
  assertEquals(r.root, "/custom/path");
});

Deno.test("parseRootChoice: choice 4 relative path → resolved from cwd", () => {
  const r = parseRootChoice("4 mystaff", "/proj", "/home/user");
  assertEquals(r.root, "/proj/mystaff");
});

Deno.test("parseRootChoice: choice 4 no path → throws", () => {
  assertThrows(
    () => parseRootChoice("4", "/proj", "/home/user"),
    Error,
    "requires a path",
  );
});

Deno.test("parseRootChoice: invalid choice → throws", () => {
  assertThrows(
    () => parseRootChoice("5", "/proj", "/home/user"),
    Error,
    "invalid choice",
  );
});

// ─── resolveRoot ─────────────────────────────────────────────────────────────

Deno.test("resolveRoot: env (STAFF_ROOT) beats tree", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    Deno.env.set("STAFF_ROOT", `${tmp}/fromenv`);
    // Also create a tree that would be found via step 2
    await Deno.mkdir(`${tmp}/proj/staff/canon`, { recursive: true });

    const r = await resolveRoot({ cwd: `${tmp}/proj`, interactive: false });
    assertEquals(r.origin, "env");
    assertEquals(r.root, `${tmp}/fromenv`);
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveRoot: STAFF_DATA_DIR back-compat (step 1)", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    Deno.env.set("STAFF_DATA_DIR", `${tmp}/compat`);

    const r = await resolveRoot({ cwd: `${tmp}/proj`, interactive: false });
    assertEquals(r.origin, "env");
    assertEquals(r.root, `${tmp}/compat`);
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveRoot: tree beats registered", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    // Create a tree
    await Deno.mkdir(`${tmp}/proj/staff/canon`, { recursive: true });
    // Register a different root in config
    const { saveCliConfig } = await import("../src/cli/config.ts");
    await saveCliConfig({ roots: { [`${tmp}/proj`]: `${tmp}/registered` } });

    const r = await resolveRoot({ cwd: `${tmp}/proj`, interactive: false });
    assertEquals(r.origin, "tree");
    assertEquals(r.root, `${tmp}/proj/staff`);
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveRoot: registered beats alwaysUserRoot", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    const { saveCliConfig } = await import("../src/cli/config.ts");
    await saveCliConfig({
      alwaysUserRoot: true,
      roots: { [`${tmp}/proj`]: `${tmp}/regroot` },
    });
    await Deno.mkdir(`${tmp}/proj`, { recursive: true });

    const r = await resolveRoot({ cwd: `${tmp}/proj`, interactive: false });
    assertEquals(r.origin, "registered");
    assertEquals(r.root, `${tmp}/regroot`);
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveRoot: registered ancestor match", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    const { saveCliConfig } = await import("../src/cli/config.ts");
    await saveCliConfig({ roots: { [`${tmp}/proj`]: `${tmp}/regroot` } });
    await Deno.mkdir(`${tmp}/proj/sub/deep`, { recursive: true });

    const r = await resolveRoot({ cwd: `${tmp}/proj/sub/deep`, interactive: false });
    assertEquals(r.origin, "registered");
    assertEquals(r.root, `${tmp}/regroot`);
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveRoot: alwaysUserRoot beats interactive", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    const { saveCliConfig } = await import("../src/cli/config.ts");
    await saveCliConfig({ alwaysUserRoot: true });

    const r = await resolveRoot({ cwd: `${tmp}/proj`, interactive: true });
    assertEquals(r.origin, "user");
    assertEquals(r.root, `${tmp}/Staff`); // HOME is tmp
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveRoot: non-interactive fail-loud error", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    await Deno.mkdir(`${tmp}/bare`, { recursive: true });

    await assertRejects(
      () => resolveRoot({ cwd: `${tmp}/bare`, interactive: false }),
      Error,
      "no STAFF root",
    );
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("resolveRoot: fail-loud message is actionable", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    clearRootEnv();
    isolateConfig(tmp);
    await Deno.mkdir(`${tmp}/bare`, { recursive: true });

    let msg = "";
    try {
      await resolveRoot({ cwd: `${tmp}/bare`, interactive: false });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    assertEquals(msg.includes("$STAFF_ROOT"), true, "should mention $STAFF_ROOT");
    assertEquals(msg.includes("staff root"), true, "should mention staff root verb");
    assertEquals(msg.includes("--always"), true, "should mention --always");
  } finally {
    clearRootEnv();
    await Deno.remove(tmp, { recursive: true });
  }
});

// ─── createTreeSkeleton ───────────────────────────────────────────────────────

Deno.test("createTreeSkeleton creates canon, proposal, sessions", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    // Root must use one of the checked names (staff/Staff/.staff) so that
    // findUpstreamTree can locate it when walking up from the parent dir.
    const root = `${tmp}/staff`;
    await createTreeSkeleton(root);
    for (const sub of ["canon", "proposal", "sessions"]) {
      const stat = await Deno.stat(`${root}/${sub}`);
      assertEquals(stat.isDirectory, true, `${sub}/ must be a directory`);
    }
    // Verify step 2 would qualify it now
    const found = await findUpstreamTree(tmp);
    assertEquals(found, `${tmp}/staff`);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
