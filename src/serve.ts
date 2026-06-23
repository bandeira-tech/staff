/**
 * @module
 * cc-chat serve entrypoint.
 *
 * Spins up a Deno HTTP listener at `--port` (default 7373) that:
 *   - serves the b3nd HTTP wire via `@bandeira-tech/b3nd-move/http/service`
 *     under `/api/v1/*` (status, receive, read, observe)
 *   - serves the static web UI for everything else
 *
 * Run:
 *   deno task serve [--port 7373] [--host 0.0.0.0]
 *
 * The same rig binary can be reached from a local Claude Code MCP plugin
 * (loopback) or by remote agents (set --host 0.0.0.0 and target the URL).
 */
import { httpApi } from "@bandeira-tech/b3nd-move/http/service";
import { dirname, fromFileUrl, join, resolve } from "@std/path";
import { createCcChatRig } from "./rig.ts";

interface Args {
  port: number;
  host: string;
  ttlMs: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { port: 7373, host: "127.0.0.1", ttlMs: 30_000 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--port") a.port = Number(argv[++i]);
    else if (v === "--host") a.host = argv[++i];
    else if (v === "--ttl-ms") a.ttlMs = Number(argv[++i]);
    else if (v === "--help" || v === "-h") {
      console.log("Usage: serve [--port 7373] [--host 127.0.0.1] [--ttl-ms 30000]");
      Deno.exit(0);
    }
  }
  return a;
}

const WEB_DIR = (() => {
  const here = dirname(fromFileUrl(import.meta.url));
  return resolve(here, "..", "web");
})();

const STATIC_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveStatic(pathname: string): Promise<Response> {
  let rel = pathname === "/" ? "/index.html" : pathname;
  // Block path traversal
  if (rel.includes("..")) return new Response("forbidden", { status: 403 });
  const full = join(WEB_DIR, rel);
  try {
    const body = await Deno.readFile(full);
    const ext = rel.slice(rel.lastIndexOf("."));
    const ct = STATIC_MIME[ext] ?? "application/octet-stream";
    return new Response(body, {
      status: 200,
      headers: { "content-type": ct, "cache-control": "no-cache" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

export interface ServeOptions {
  port?: number;
  host?: string;
  ttlMs?: number;
}

export interface RunningServer {
  url: string;
  port: number;
  shutdown(): Promise<void>;
}

export function startServer(opts: ServeOptions = {}): RunningServer {
  const port = opts.port ?? 0;
  const host = opts.host ?? "127.0.0.1";
  const { rig, node } = createCcChatRig({ ttlMs: opts.ttlMs });
  const api = httpApi(rig);

  const handler = (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      return api(req);
    }
    if (req.method === "GET") return serveStatic(url.pathname);
    return new Response("not found", { status: 404 });
  };

  const server = Deno.serve({ port, hostname: host, onListen: () => {} }, handler);
  const bound = server.addr.port;

  return {
    url: `http://${host}:${bound}`,
    port: bound,
    async shutdown() {
      await server.shutdown();
      node.close();
    },
  };
}

if (import.meta.main) {
  const args = parseArgs(Deno.args);
  const s = startServer(args);
  console.log(`cc-chat rig listening at ${s.url}`);
  console.log(`  api: ${s.url}/api/v1/{status,receive,read,observe}`);
  console.log(`  ui:  ${s.url}/`);
  Deno.addSignalListener("SIGINT", async () => {
    console.log("shutting down…");
    await s.shutdown();
    Deno.exit(0);
  });
}
