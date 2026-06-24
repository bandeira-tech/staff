/**
 * mint.ts — post a raw [uri, payload] to a running cc-chat rig.
 * Used by the manager for URIs that fall outside say.ts's typed grammar
 * (notably <root><room>/meta.md). Payload comes from stdin.
 *
 *   deno run --allow-net=127.0.0.1 scripts/mint.ts \
 *     --url http://127.0.0.1:7373 \
 *     immutable://open/cc-chat/<room>/meta.md < body.md
 */
import { ccChatClient } from "../src/client.ts";

const argv = [...Deno.args];
const i = argv.indexOf("--url");
const url = i >= 0 ? argv[i + 1] : "http://127.0.0.1:7373";
if (i >= 0) argv.splice(i, 2);

const uri = argv[0];
if (!uri) {
  console.error("usage: mint.ts [--url URL] <uri>   (payload from stdin)");
  Deno.exit(2);
}

const payload = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const client = ccChatClient({ url });
const res = await client.send(uri, payload);
if (res.accepted) {
  console.log(uri);
} else {
  console.error(`error: send rejected — ${res.error ?? "unknown"}`);
  Deno.exit(1);
}
