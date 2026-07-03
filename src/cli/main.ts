/**
 * @module
 * `staff` — the STAFF by BANDEIRA✶TECH command line.
 *
 * Install:
 *   deno install --global -A -n staff jsr:@bandeira-tech/staff/cli
 *
 * Verbs: add, promote, list, read, cast, rig, root. Run `staff --help`.
 */

import { add, addGate } from "./verbs/add.ts";
import { proseFrom } from "./prose.ts";
import { rigInfo, setRig } from "./verbs/rig.ts";
import { list } from "./verbs/list.ts";
import { readPath } from "./verbs/read.ts";
import { promote } from "./verbs/promote.ts";
import { executeCast, parseCastArgs } from "./verbs/cast.ts";
import { resolveRoot, createTreeSkeleton } from "./root.ts";
import { loadCliConfig, saveCliConfig } from "./config.ts";

const HELP = `staff — Claude as Chief of Staff (STAFF by BANDEIRA✶TECH)

Usage:
  staff add <kind> <name> [<prose>|-]        propose a primitive (kind: trait|role|play|team|staff)
  staff add gate <kind>/<name>/<gate> [<prose>|-]
  staff promote <kind> <name> [<ts>]         materialize canon/ from a proposal
  staff list [<kind>]                        canon names + pending proposals (bare: overview of all kinds, 4 per kind)
  staff read <path>                          read one path under the staff root
  staff cast play|role|trait|team …          compose refs and spawn a claude session
  staff rig [<path|url>]                     show / set the resolved rig
  staff root [<path>|user [--always]]        show / set the STAFF root for this folder

Universal flags:
  --rig <path|url>    override the resolved rig for this run

Cast:
  staff cast play <name> [with <kind>/<name> …] [--room <room>] [--session <name>] [--dry-run] [-- <claude args>]
  staff cast role <name> [<trait,trait…>]    [same options]
  staff cast trait <trait[,trait…]>          [same options]
  staff cast team <name>                     [same options]
`;

/** Pull `--rig <value>` or `--rig=value` out of argv (before `--`); return [value, rest]. */
export function extractFlag(
  argv: string[],
  flag: string,
): [string | undefined, string[]] {
  const stop = argv.indexOf("--");
  const limit = stop === -1 ? argv.length : stop;
  for (let i = 0; i < limit; i++) {
    const tok = argv[i];
    if (tok === flag) {
      if (i + 1 >= limit) throw new Error(`${flag} requires a value`);
      return [argv[i + 1], [...argv.slice(0, i), ...argv.slice(i + 2)]];
    }
    if (tok.startsWith(`${flag}=`)) {
      const value = tok.slice(flag.length + 1);
      if (!value) throw new Error(`${flag} requires a value`);
      return [value, [...argv.slice(0, i), ...argv.slice(i + 1)]];
    }
  }
  return [undefined, argv];
}

// Verbs that need a resolved root before loading the rig.
const DATA_VERBS = new Set(["add", "list", "read", "promote", "cast"]);

async function dispatch(argv: string[]): Promise<number> {
  const [rig, rest] = extractFlag(argv, "--rig");
  const [verb, ...args] = rest;

  // Pre-resolve root for data verbs (interactive if TTY; throws if unresolvable).
  // rig/root/help handle their own root concerns.
  if (verb !== undefined && DATA_VERBS.has(verb)) {
    const resolution = await resolveRoot({ cwd: Deno.cwd() });
    Deno.env.set("STAFF_ROOT", resolution.root);
  }

  switch (verb) {
    case undefined:
    case "--help":
    case "-h":
    case "help": {
      console.log(HELP);
      return 0;
    }
    case "rig": {
      // Try non-interactive root resolution so the root: line is accurate.
      let rootDesc: string;
      try {
        const res = await resolveRoot({ cwd: Deno.cwd(), interactive: false });
        Deno.env.set("STAFF_ROOT", res.root);
        rootDesc = `${res.root} (${res.origin})`;
      } catch {
        rootDesc = "(not set — run `staff root <path|user>`)";
      }
      if (args[0]) {
        const path = await setRig(args[0]);
        console.log(`rig set: ${args[0]} (${path})`);
        return 0;
      }
      const info = await rigInfo({ explicit: rig });
      console.log(`rig:    ${info.input} (${info.origin})`);
      console.log(`root:   ${rootDesc}`);
      if (info.status !== undefined) {
        console.log(`status: ${JSON.stringify(info.status)}`);
      }
      if (info.statusError) console.log(`status: ERROR — ${info.statusError}`);
      return 0;
    }
    case "root": {
      const [rootArg, ...rootRest] = args;

      if (!rootArg) {
        // Non-interactive resolve and print; exit 1 with guidance if unresolvable.
        try {
          const resolution = await resolveRoot({
            cwd: Deno.cwd(),
            interactive: false,
          });
          console.log(`root: ${resolution.root} (${resolution.origin})`);
        } catch (e) {
          console.error(e instanceof Error ? e.message : String(e));
          return 1;
        }
        return 0;
      }

      const config = await loadCliConfig();
      const home = Deno.env.get("HOME") ?? "";
      const cwd = Deno.cwd();

      if (rootArg === "user") {
        const always = rootRest.includes("--always");
        const userRoot = config.userRoot ?? `${home}/Staff`;
        await createTreeSkeleton(userRoot);
        if (always) {
          await saveCliConfig({ ...config, alwaysUserRoot: true });
          console.log(`root: ${userRoot} (user — always-user enabled)`);
        } else {
          await saveCliConfig({
            ...config,
            roots: { ...(config.roots ?? {}), [cwd]: userRoot },
          });
          console.log(`root: ${userRoot} (registered)`);
        }
        return 0;
      }

      // Register an explicit path.
      const absRoot = rootArg.startsWith("/") ? rootArg : `${cwd}/${rootArg}`;
      await createTreeSkeleton(absRoot);
      await saveCliConfig({
        ...config,
        roots: { ...(config.roots ?? {}), [cwd]: absRoot },
      });
      console.log(`root: ${absRoot} (registered)`);
      return 0;
    }
    case "add": {
      if (args[0] === "gate") {
        const path = args[1] ?? "";
        if (path.split("/").length !== 3) {
          throw new Error(
            "usage: staff add gate <kind>/<name>/<gate> [<prose>|-]",
          );
        }
        const prose = await proseFrom(args[2]);
        const { uri } = await addGate({ path, prose, rig });
        console.log(`✓ ${uri}`);
        return 0;
      }
      if (!args[0] || !args[1]) {
        throw new Error("usage: staff add <kind> <name> [<prose>|-]");
      }
      const prose = await proseFrom(args[2]);
      const { uri } = await add({ kindArg: args[0], name: args[1], prose, rig });
      console.log(`✓ ${uri}`);
      return 0;
    }
    case "list": {
      // Helper: format a single entry line (reusable for both full and overview paths).
      const entryLine = (e: Awaited<ReturnType<typeof list>>[number]): string => {
        const marks = [
          e.canon ? "canon" : "     ",
          e.proposals > 0 ? `${e.proposals} proposal(s) pending` : "",
        ].filter(Boolean).join("  ");
        return `${e.name.padEnd(24)} ${marks}`;
      };

      if (!args[0]) {
        // Bare `staff list` — overview of all kinds, 4 entries per kind.
        const kindPairs = [
          ["trait", "traits"],
          ["role", "roles"],
          ["play", "plays"],
          ["team", "teams"],
          ["staff", "staff"],
        ] as const;

        for (const [singKind, plurKind] of kindPairs) {
          const entries = await list(singKind, { rig });
          console.log(`${plurKind}:`);
          if (entries.length === 0) {
            console.log("  (none)");
          } else {
            const shown = entries.slice(0, 4);
            for (const e of shown) {
              console.log(`  ${entryLine(e)}`);
            }
            if (entries.length > 4) {
              console.log(
                `  … and ${entries.length - 4} more — staff list ${singKind}`,
              );
            }
          }
        }
        return 0;
      }

      // Full listing for a specific kind.
      const entries = await list(args[0], { rig });
      for (const e of entries) {
        console.log(entryLine(e));
      }
      if (entries.length === 0) console.log("(none)");
      return 0;
    }
    case "read": {
      if (!args[0]) throw new Error("usage: staff read <path>");
      console.log(await readPath(args[0], { rig }));
      return 0;
    }
    case "promote": {
      if (!args[0] || !args[1]) {
        throw new Error("usage: staff promote <kind> <name> [<ts>]");
      }
      const res = await promote(args[0], args[1], args[2], { rig });
      console.log(`✓ promoted ${args[0]}/${args[1]} @ ${res.ts}`);
      for (const uri of res.written) console.log(`  ${uri}`);
      return 0;
    }
    case "cast": {
      const spec = parseCastArgs(args);
      spec.rig = rig;
      const { plan, code } = await executeCast(spec);
      if (spec.dryRun) {
        console.log(`session: ${plan.sessionUri}`);
        console.log(`claude ${plan.claudeArgv.map((a) => JSON.stringify(a)).join(" ")}`);
        console.log("--- brief ---");
        console.log(plan.brief);
        return 0;
      }
      console.log(`session closed with exit code ${code}`);
      return code ?? 0;
    }
    default: {
      console.error(`unknown verb: ${verb}\n`);
      console.log(HELP);
      return 1;
    }
  }
}

if (import.meta.main) {
  try {
    Deno.exit(await dispatch(Deno.args));
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    Deno.exit(1);
  }
}
