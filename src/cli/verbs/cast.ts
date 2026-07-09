/**
 * `staff cast` — put staff data to run. One cast = one Claude Code
 * session: resolve refs through the rig, record the session brief,
 * spawn `claude` with the brief appended to its system prompt.
 *
 * Rooms are data, not integrations: --room writes a cc-chat room URI
 * into the brief; the spawned session's cc-chat plugin interprets it.
 */

import {
  KIND_ALIASES,
  type Kind,
  isValidName,
  sessionLeafUri,
} from "../../protocol.ts";
import { findUris, loadStaffRig, receiveSettled, STAFF_ROOT } from "../rig-loader.ts";
import { kindNames } from "./list.ts";

export const CC_CHAT_ROOT = "immutable://open/cc-chat/";

export interface CastRef {
  kind: Kind;
  name: string;
}

export interface CastSpec {
  target: {
    type: "play" | "role" | "trait" | "team";
    name?: string;
    traits: string[];
  };
  withRefs: CastRef[];
  room?: string;
  session?: string;
  claudeArgs: string[];
  dryRun: boolean;
  rig?: string;
}

export interface CastPlan {
  sessionName: string;
  sessionUri: string;
  brief: string;
  refs: string[];
  claudeArgv: string[];
}

const CAST_TYPES = ["play", "role", "trait", "team"] as const;

function parseRef(token: string): CastRef {
  const [kindArg, name, ...extra] = token.split("/");
  const kind = KIND_ALIASES[kindArg];
  if (!kind || !name || extra.length > 0 || !isValidName(name)) {
    throw new Error(`invalid ref (expected <kind>/<name>): ${token}`);
  }
  return { kind, name };
}

export function parseCastArgs(argv: string[]): CastSpec {
  const sep = argv.indexOf("--");
  const claudeArgs = sep === -1 ? [] : argv.slice(sep + 1);
  const own = sep === -1 ? [...argv] : argv.slice(0, sep);

  const spec: CastSpec = {
    target: { type: "play", traits: [] },
    withRefs: [],
    claudeArgs,
    dryRun: false,
  };

  // flags
  const positionals: string[] = [];
  for (let i = 0; i < own.length; i++) {
    const tok = own[i];
    if (tok === "--dry-run") spec.dryRun = true;
    else if (tok === "--room" || tok === "--session") {
      const v = own[++i];
      if (!v) throw new Error(`${tok} requires a value`);
      if (tok === "--room") spec.room = v;
      else spec.session = v;
    } else positionals.push(tok);
  }

  const [type, ...rest] = positionals;
  if (!(CAST_TYPES as readonly string[]).includes(type ?? "")) {
    throw new Error("usage: staff cast play|role|trait|team …");
  }
  spec.target.type = type as CastSpec["target"]["type"];

  if (type === "trait") {
    if (!rest[0]) throw new Error("usage: staff cast trait <trait[,trait…]>");
    spec.target.traits = rest[0].split(",").filter(Boolean);
    rest.splice(0, 1);
  } else {
    if (!rest[0]) throw new Error(`usage: staff cast ${type} <name> …`);
    spec.target.name = rest.shift();
    if (type === "role" && rest[0] && rest[0] !== "with" && rest[0].includes(",")) {
      spec.target.traits = rest.shift()!.split(",").filter(Boolean);
    } else if (type === "role" && rest[0] && rest[0] !== "with" && !rest[0].includes("/")) {
      spec.target.traits = [rest.shift()!];
    }
  }

  // remaining positionals: optional literal "with" then <kind>/<name> refs
  for (const tok of rest) {
    if (tok === "with") continue;
    spec.withRefs.push(parseRef(tok));
  }
  return spec;
}

function deriveSessionName(spec: CastSpec): string {
  const base = spec.target.name ?? spec.target.traits.join("-");
  return base.slice(0, 48);
}

function composeBrief(
  spec: CastSpec,
  refs: string[],
  sessionName: string,
): string {
  const lines: string[] = [
    `# STAFF cast brief — session ${sessionName}`,
    "",
    `You are cast from the builder's STAFF canon (root: ${STAFF_ROOT}).`,
    "",
    `Session: sessions/${sessionName}/ — write {ts}-update.md leaves as you`,
    "work; close with a {ts}-delivery.md leaf. Timestamps are YYYYMMDDhhmmss UTC.",
    "",
    "Refs — read every one of these before acting (refs, not copies):",
    ...refs.map((r) => `  - ${r}`),
    "",
  ];
  if (spec.room) {
    lines.push(
      `Room: ${CC_CHAT_ROOT}${spec.room}/`,
      "Join this room (cc-chat convention): announce yourself, observe via",
      "your b3nd MCP subscription, coordinate through it, and stay subscribed",
      "for the life of this session.",
      "",
    );
  }
  lines.push(
    "Read refs through your staff/b3nd MCP surface (b3nd_read) or the bare",
    "filesystem root if that is your surface. Honor gates: do not declare",
    "success while any gate you carry is OPEN.",
  );
  return lines.join("\n");
}

export async function planCast(spec: CastSpec): Promise<CastPlan> {
  const { rig } = await loadStaffRig({ explicit: spec.rig });

  const refs: CastRef[] = [];
  if (spec.target.type !== "trait") {
    refs.push({ kind: KIND_ALIASES[spec.target.type], name: spec.target.name! });
  }
  for (const t of spec.target.traits) refs.push({ kind: "traits", name: t });
  refs.push(...spec.withRefs);

  const resolved: string[] = [];
  for (const ref of refs) {
    const uris = await findUris(
      rig,
      `${STAFF_ROOT}canon/${ref.kind}/${ref.name}/`,
    );
    if (uris.length === 0) {
      const names = await kindNames(rig, ref.kind);
      const near = names
        .filter((n) => n.includes(ref.name) || ref.name.includes(n))
        .slice(0, 5);
      throw new Error(
        `no canon ${ref.kind}/${ref.name}` +
          (near.length ? ` — did you mean: ${near.join(", ")}` : ""),
      );
    }
    resolved.push(`canon/${ref.kind}/${ref.name}/`);
  }

  const sessionName = spec.session ?? deriveSessionName(spec);
  if (!isValidName(sessionName)) {
    throw new Error(`invalid session name: ${sessionName}`);
  }
  const sessionUri = sessionLeafUri(STAFF_ROOT, sessionName, "main");
  const brief = composeBrief(spec, resolved, sessionName);
  return {
    sessionName,
    sessionUri,
    brief,
    refs: resolved,
    claudeArgv: ["--append-system-prompt", brief, ...spec.claudeArgs],
  };
}

export async function executeCast(
  spec: CastSpec,
): Promise<{ plan: CastPlan; code?: number }> {
  const plan = await planCast(spec);
  if (spec.dryRun) return { plan };

  const { rig } = await loadStaffRig({ explicit: spec.rig });
  const [res] = await receiveSettled(rig, [[plan.sessionUri, plan.brief]]);
  if (!res?.accepted) {
    throw new Error(
      `session record rejected: ${plan.sessionUri} — ${res?.error ?? "no reason"}`,
    );
  }

  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command("claude", {
      args: plan.claudeArgv,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new Error(
        "claude binary not found on PATH — install Claude Code first",
      );
    }
    throw e;
  }
  const status = await child.status;
  return { plan, code: status.code };
}
