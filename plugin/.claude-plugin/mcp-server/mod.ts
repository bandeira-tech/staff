#!/usr/bin/env -S deno run -A
/**
 * cc-chat MCP server — pure b3nd PIN over stdio.
 *
 * Exposes the cc-chat rig running at $CC_CHAT_URL via the standard b3nd
 * MCP tools (`b3nd_receive`, `b3nd_read`, `b3nd_status`) and resource
 * subscriptions (which map onto `rig.observe`). Agents talk to the rig
 * via the URI shape taught by the bundled skill — no chat-specific MCP
 * verbs.
 *
 * Env:
 *   CC_CHAT_URL  — base URL of the cc-chat rig. Default
 *                  http://127.0.0.1:7373. Use a public URL to join a
 *                  remote rig.
 *
 * Logs go to stderr; stdout is the MCP JSON-RPC stream.
 */
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@^1.0.0/server/stdio.js";
import { buildMcpServer } from "jsr:@bandeira-tech/b3nd-move@^0.18.0/mcp/service";
import { connection, Rig } from "jsr:@bandeira-tech/b3nd-core@^0.22.0";
import { HttpClient } from "jsr:@bandeira-tech/b3nd-move@^0.18.0/http/client";

const VERSION = "0.0.1";

async function main() {
  const url = Deno.env.get("CC_CHAT_URL") ?? "http://127.0.0.1:7373";
  const client = new HttpClient({ url });
  const conn = connection(client, ["cc-chat://**"], { id: "remote-cc-chat" });
  const rig = new Rig({
    routes: { receive: [conn], read: [conn], observe: [conn] },
  });

  console.error(`cc-chat-mcp ${VERSION} — rig: ${url}`);
  const server = buildMcpServer(rig, { name: "cc-chat", version: VERSION });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("cc-chat-mcp connected via stdio");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("fatal:", err);
    Deno.exit(1);
  });
}
