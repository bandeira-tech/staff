/**
 * @module
 * `staff` — the STAFF by BANDEIRA✶TECH command line.
 *
 * Install:
 *   deno install --global -A -n staff jsr:@bandeira-tech/staff/cli
 *
 * Verbs: add, promote, list, read, cast, rig. Run `staff --help`.
 */

import { add, addGate } from "./verbs/add.ts";
import { proseFrom } from "./prose.ts";
import { rigInfo, setRig } from "./verbs/rig.ts";
import { list } from "./verbs/list.ts";
import { readPath } from "./verbs/read.ts";
import { promote } from "./verbs/promote.ts";
import { executeCast, parseCastArgs } from "./verbs/cast.ts";

const HELP = `staff — Claude as Chief of Staff (STAFF by BANDEIRA✶TECH)

Usage:
  staff add <kind> <name> [<prose>|-]        propose a primitive (kind: trait|role|play|team|staff)
  staff add gate <kind>/<name>/<gate> [<prose>|-]
  staff promote <kind> <name> [<ts>]         materialize canon/ from a proposal
  staff list <kind>                          canon names + pending proposals
  staff read <path>                          read one path under the staff root
  staff cast play|role|trait|team …          compose refs and spawn a claude session
  staff rig [<path|url>]                     show / set the resolved rig

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

async function dispatch(argv: string[]): Promise<number> {
  const [rig, rest] = extractFlag(argv, "--rig");
  const [verb, ...args] = rest;

  switch (verb) {
    case undefined:
    case "--help":
    case "-h":
    case "help": {
      console.log(HELP);
      return 0;
    }
    case "rig": {
      if (args[0]) {
        const path = await setRig(args[0]);
        console.log(`rig set: ${args[0]} (${path})`);
        return 0;
      }
      const info = await rigInfo({ explicit: rig });
      console.log(`rig:      ${info.input} (${info.origin})`);
      console.log(`data dir: ${info.dataDir}`);
      if (info.status !== undefined) {
        console.log(`status:   ${JSON.stringify(info.status)}`);
      }
      if (info.statusError) console.log(`status:   ERROR — ${info.statusError}`);
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
      if (!args[0]) throw new Error("usage: staff list <kind>");
      const entries = await list(args[0], { rig });
      for (const e of entries) {
        const marks = [
          e.canon ? "canon" : "     ",
          e.proposals > 0 ? `${e.proposals} proposal(s) pending` : "",
        ].filter(Boolean).join("  ");
        console.log(`${e.name.padEnd(24)} ${marks}`);
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
