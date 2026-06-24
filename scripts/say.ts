/**
 * Tiny CLI smoke tool — send a typed message to a running cc-chat rig.
 *
 *   deno run --allow-net scripts/say.ts --url http://127.0.0.1:7373 \
 *     --room 20260624120000-test --name alice --type msg "hi there"
 *
 *   deno run --allow-net scripts/say.ts --url http://host:port \
 *     --room 20260624120000-demo --name alice --type mention --target bob "hey"
 *
 * Flags:
 *   --url   <u>   Rig HTTP URL (default http://127.0.0.1:7373)
 *   --root  <r>   URI root (default immutable://open/cc-chat/)
 *   --room  <r>   Room in <ts>-<slug> format (required)
 *   --name  <n>   Participant name (required)
 *   --type  <t>   One of: msg join end mention pause resume output (default msg)
 *   --target <t>  Target name, required when --type=mention
 *   <text>        Message body (positional, required)
 */
import { ccChatClient } from "../src/client.ts";
import {
  endUri,
  isManagerOnly,
  joinUri,
  MANAGER_NAME,
  mentionUri,
  mintNonce,
  msgUri,
  outputUri,
  pauseUri,
  resumeUri,
} from "../src/protocol.ts";

function arg(flag: string, argv: string[]): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function stripFlag(flag: string, argv: string[], withValue: boolean): void {
  const i = argv.indexOf(flag);
  if (i < 0) return;
  argv.splice(i, withValue ? 2 : 1);
}

const argv = [...Deno.args];

const url = arg("--url", argv) ?? "http://127.0.0.1:7373";
const root = arg("--root", argv) ?? "immutable://open/cc-chat/";
const room = arg("--room", argv);
const name = arg("--name", argv);
const type = arg("--type", argv) ?? "msg";
const target = arg("--target", argv);

// Strip all flags so positionals remain
stripFlag("--url", argv, true);
stripFlag("--root", argv, true);
stripFlag("--room", argv, true);
stripFlag("--name", argv, true);
stripFlag("--type", argv, true);
stripFlag("--target", argv, true);

const text = argv.join(" ").trim();

// Validate required args
if (!room) {
  console.error("error: --room is required");
  console.error("usage: say.ts [--url URL] [--root ROOT] --room ROOM --name NAME [--type TYPE] [--target TARGET] <text>");
  Deno.exit(2);
}

if (!name) {
  console.error("error: --name is required");
  console.error("usage: say.ts [--url URL] [--root ROOT] --room ROOM --name NAME [--type TYPE] [--target TARGET] <text>");
  Deno.exit(2);
}

if (!text) {
  console.error("error: positional <text> is required");
  console.error("usage: say.ts [--url URL] [--root ROOT] --room ROOM --name NAME [--type TYPE] [--target TARGET] <text>");
  Deno.exit(2);
}

if (type === "mention" && !target) {
  console.error("error: --target is required when --type=mention");
  Deno.exit(2);
}

// Reject manager-only types for non-manager names
if (isManagerOnly(type) && name !== MANAGER_NAME) {
  console.error(
    `error: type '${type}' is manager-only; use --name ${MANAGER_NAME} or choose a different --type`,
  );
  Deno.exit(2);
}

// Mint the URI based on type
let uri: string;
const now = new Date();
const slug = mintNonce();

switch (type) {
  case "msg":
    uri = msgUri(root, room, name, slug, now);
    break;
  case "join":
    uri = joinUri(root, room, name, now);
    break;
  case "end":
    uri = endUri(root, room, name, now);
    break;
  case "mention":
    uri = mentionUri(root, room, name, target!, slug, now);
    break;
  case "pause":
    uri = pauseUri(root, room, now);
    break;
  case "resume":
    uri = resumeUri(root, room, now);
    break;
  case "output":
    uri = outputUri(root, room, slug, now);
    break;
  default:
    console.error(`error: unknown --type '${type}'. Valid types: msg join end mention pause resume output`);
    Deno.exit(2);
}

const client = ccChatClient({ url, root });
const result = await client.send(uri, text);

if (result.accepted) {
  console.log(uri);
} else {
  console.error(`error: send rejected — ${result.error ?? "unknown error"}`);
  Deno.exit(1);
}
