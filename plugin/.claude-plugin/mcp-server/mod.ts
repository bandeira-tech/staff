#!/usr/bin/env -S deno run -A
/**
 * cc-chat MCP server — b3nd PIN over stdio + a synchronous observe tool.
 *
 * Tools:
 *   b3nd_receive       — standard b3nd verb (write)
 *   b3nd_read          — standard b3nd verb (read)
 *   b3nd_status        — standard b3nd verb (status)
 *   cc_chat_observe    — block for N seconds, collect URIs that fire
 *                        under a pattern, fetch payloads, return them
 *                        in one tool result
 *
 * The synchronous observe exists because Claude Code agents call MCP
 * tools turn-by-turn; they don't naturally hold an MCP resource
 * subscription across turns. `cc_chat_observe` packages observe+read
 * into one request/response.
 *
 * Env:
 *   CC_CHAT_URL  — rig base URL. Default http://127.0.0.1:7373.
 */
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@^1.0.0/server/stdio.js";
import { connection, Rig } from "jsr:@bandeira-tech/b3nd-core@^0.22.0";
import { HttpClient } from "jsr:@bandeira-tech/b3nd-move@^0.18.0/http/client";
import { buildMcpServer } from "jsr:@bandeira-tech/b3nd-move@^0.18.0/mcp/service";
import {
  observeWindow,
  rosterFromObserved,
} from "../../../src/observe-window.ts";

const VERSION = "0.0.2";
const DEFAULT_PATTERN = "cc-chat://**";
const MAX_OBSERVE_SECONDS = 300;

const TOOLS = [
  {
    name: "b3nd_receive",
    description:
      "Send messages to the cc-chat rig. Each message is [uri, payload]; uri must match the cc-chat:// grammar (cc-chat://stream/{name}/{seq} or cc-chat://presence/{name}/{seq}).",
    inputSchema: {
      type: "object" as const,
      properties: {
        messages: {
          type: "array",
          description: "Array of [uri, payload] tuples",
          items: { type: "array", minItems: 2, maxItems: 2 },
        },
      },
      required: ["messages"],
    },
  },
  {
    name: "b3nd_read",
    description:
      "Read payloads for one or more cc-chat URIs you just observed. Returns [[uri, payload], ...] — payload is null if the rig's bridge buffer already evicted it (a present-chat normal).",
    inputSchema: {
      type: "object" as const,
      properties: {
        urls: {
          type: "array",
          description: "URIs to fetch payloads for",
          items: { type: "string" },
        },
      },
      required: ["urls"],
    },
  },
  {
    name: "b3nd_status",
    description: "Health + capabilities of the cc-chat rig.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "cc_chat_observe",
    description:
      "Block for `seconds` seconds (capped at 300), collect every cc-chat:// URI that fires under `pattern` (default cc-chat://**), fetch their payloads, and return them as one tool result. Use this for 'observe for N seconds' or 'watch for X then report'. Each call is one observation window — schedule yourself to call again for 'every 5 minutes' patterns.",
    inputSchema: {
      type: "object" as const,
      properties: {
        seconds: {
          type: "number",
          description: "How long to observe (max 300).",
        },
        pattern: {
          type: "string",
          description:
            "Subscription glob (e.g. cc-chat://stream/**, cc-chat://presence/**, cc-chat://stream/writer/**). Defaults to cc-chat://**.",
        },
      },
      required: ["seconds"],
    },
  },
  {
    name: "cc_chat_who",
    description:
      "Listen for `seconds` (default 10, max 60) and return the set of participant names that fired any URI during the window — answers 'who's here right now?'. Distinct from cc_chat_observe in that it returns only the name roster, not message contents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        seconds: {
          type: "number",
          description: "Listening window length in seconds (default 10).",
        },
      },
    },
  },
];

async function callTool(rig: Rig, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "b3nd_receive": {
      const { messages } = args as { messages: [string, unknown][] };
      const results = await rig.receive(messages);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            results.map((r, i) => ({
              uri: messages[i][0],
              accepted: r.accepted,
              error: r.error,
            })),
            null,
            2,
          ),
        }],
        isError: results.some((r) => !r.accepted),
      };
    }
    case "b3nd_read": {
      const { urls } = args as { urls: string[] };
      const outs = await rig.read(urls);
      return {
        content: [{ type: "text", text: JSON.stringify(outs, null, 2) }],
        isError: false,
      };
    }
    case "b3nd_status": {
      const s = await rig.status();
      return {
        content: [{ type: "text", text: JSON.stringify(s, null, 2) }],
        isError: false,
      };
    }
    case "cc_chat_observe": {
      const a = args as { seconds: number; pattern?: string };
      const seconds = Math.max(
        1,
        Math.min(MAX_OBSERVE_SECONDS, Math.floor(a.seconds)),
      );
      const pattern = a.pattern ?? DEFAULT_PATTERN;
      const observed = await observeWindow(rig, pattern, seconds);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ pattern, seconds, observed }, null, 2),
        }],
        isError: false,
      };
    }
    case "cc_chat_who": {
      const a = args as { seconds?: number };
      const seconds = Math.max(
        1,
        Math.min(60, Math.floor(a.seconds ?? 10)),
      );
      const observed = await observeWindow(rig, DEFAULT_PATTERN, seconds);
      const roster = rosterFromObserved(observed);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ seconds, ...roster }, null, 2),
        }],
        isError: false,
      };
    }
    default:
      return {
        content: [{ type: "text", text: `unknown tool: ${name}` }],
        isError: true,
      };
  }
}

async function main() {
  const url = Deno.env.get("CC_CHAT_URL") ?? "http://127.0.0.1:7373";
  const client = new HttpClient({ url });
  const conn = connection(client, ["cc-chat://**"], { id: "remote-cc-chat" });
  const rig = new Rig({
    routes: { receive: [conn], read: [conn], observe: [conn] },
  });

  console.error(`cc-chat-mcp ${VERSION} — rig: ${url}`);

  // buildMcpServer returns a MinimalServer wired with b3nd_* tools and
  // resource subscriptions. We override tools/list and tools/call to add
  // cc_chat_observe; the original handlers were replaced wholesale.
  const server = buildMcpServer(rig, { name: "cc-chat", version: VERSION });

  // deno-lint-ignore no-explicit-any
  (server as any).setRequestHandler("tools/list", () => ({ tools: TOOLS }));
  // deno-lint-ignore no-explicit-any
  (server as any).setRequestHandler("tools/call", async (request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }) => {
    const { name, arguments: args } = request.params;
    try {
      return await callTool(rig, name, args ?? {});
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  });

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
