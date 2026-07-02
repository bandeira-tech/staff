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

/** Pull `--rig <value>` out of argv; return [value, rest]. */
export function extractFlag(
  argv: string[],
  flag: string,
): [string | undefined, string[]] {
  const i = argv.indexOf(flag);
  if (i === -1) return [undefined, argv];
  const value = argv[i + 1];
  if (value === undefined) throw new Error(`${flag} requires a value`);
  return [value, [...argv.slice(0, i), ...argv.slice(i + 2)]];
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
        const prose = await proseFrom(args[2]);
        const { uri } = await addGate({ path: args[1] ?? "", prose, rig });
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
