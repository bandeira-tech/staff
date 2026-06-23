/**
 * Tiny CLI smoke tool — send a message to a running cc-chat rig.
 *
 *   deno run --allow-net scripts/say.ts <name> <text...>
 *   deno run --allow-net scripts/say.ts --presence <name> join
 *   deno run --allow-net scripts/say.ts --url http://host:port <name> hi
 */
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import { mintPresenceUri, mintStreamUri } from "../src/protocol.ts";

function arg(flag: string, argv: string[]): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

const argv = [...Deno.args];
const url = arg("--url", argv) ?? "http://127.0.0.1:7373";
let presence = false;
const i = argv.indexOf("--presence");
if (i >= 0) {
  presence = true;
  argv.splice(i, 1);
}
const urlI = argv.indexOf("--url");
if (urlI >= 0) argv.splice(urlI, 2);

const name = argv[0];
const text = argv.slice(1).join(" ");

if (!name || !text) {
  console.error("usage: say.ts [--url URL] [--presence] <name> <text...>");
  Deno.exit(2);
}

const client = new HttpClient({ url });
const uri = presence ? mintPresenceUri(name) : mintStreamUri(name);
const payload = new TextEncoder().encode(text);
const results = await client.receive([[uri, payload]]);

console.log(JSON.stringify({ url, uri, results }, null, 2));
