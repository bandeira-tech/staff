/**
 * read.ts — fetch one or more URIs from a running cc-chat rig.
 * Prints `<uri>\n<payload>\n---\n` for each URI in input order.
 *
 *   deno run --allow-net=127.0.0.1 scripts/read.ts \
 *     [--url http://127.0.0.1:7373] \
 *     <uri> [<uri> ...]
 */
import { ccChatClient } from "../src/client.ts";

const argv = [...Deno.args];
const i = argv.indexOf("--url");
const url = i >= 0 ? argv[i + 1] : "http://127.0.0.1:7373";
if (i >= 0) argv.splice(i, 2);

const uris = argv;
if (uris.length === 0) {
  console.error("usage: read.ts [--url URL] <uri> [<uri> ...]");
  Deno.exit(2);
}

const client = ccChatClient({ url });
const out = await client.read(uris);
for (const { uri, payload } of out) {
  console.log(uri);
  console.log(payload ?? "(null)");
  console.log("---");
}
