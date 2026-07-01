/**
 * @module
 * HTTP launcher for the staff rig — with CORS for any localhost origin.
 *
 * `bnd node --http` ships no CORS hook (b3nd-move 0.19.0 doesn't expose
 * the codec export needed to wrap `httpApi` directly). This launcher
 * spawns `bnd node --http` on a private internal port and exposes a
 * reverse-proxy on the public port that adds CORS headers and handles
 * preflights. The MCP entry point (`bnd node --mcp`) is unaffected.
 *
 *   deno run --allow-net --allow-read --allow-write --allow-env --allow-run \
 *     .claude-plugin/serve-http.ts
 *
 *   deno run ... .claude-plugin/serve-http.ts --port 7373 --internal-port 17373
 *
 * Flags:
 *   --port          <n>  public port (default 7373)
 *   --internal-port <n>  private port `bnd node --http` binds to (default port+10000)
 *
 * Why "all localhost" and not `*`: only echo origins we recognize as
 * loopback, so a credentialed fetch from a future UI works (`*` is
 * rejected by browsers when `Access-Control-Allow-Credentials: true`).
 */

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const RIG_PATH = `${SCRIPT_DIR}staff.rig.ts`;

function arg(flag: string, fallback: string): string {
  const i = Deno.args.indexOf(flag);
  return i >= 0 && Deno.args[i + 1] ? Deno.args[i + 1] : fallback;
}

const port = Number(arg("--port", "7373"));
const internalPort = Number(arg("--internal-port", String(port + 10000)));
const internalUrl = `http://127.0.0.1:${internalPort}`;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
function isLocalOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function applyCors(headers: Headers, origin: string | null): Headers {
  if (!isLocalOrigin(origin)) return headers;
  headers.set("access-control-allow-origin", origin!);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "600");
  headers.append("vary", "Origin");
  return headers;
}

// 1. Spawn `bnd node --http=<internal>` on a private port
console.log(`spawning: bnd node --http=${internalPort} ${RIG_PATH}`);
const child = new Deno.Command("bnd", {
  args: ["node", `--http=${internalPort}`, RIG_PATH],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

// 2. Wait until the internal rig answers /api/v1/status
async function waitReady(deadlineMs: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < deadlineMs) {
    try {
      const r = await fetch(`${internalUrl}/api/v1/status`);
      if (r.ok) { await r.body?.cancel(); return; }
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`internal rig at ${internalUrl} did not become ready`);
}
await waitReady(15_000);

// 3. Public proxy with CORS
const server = Deno.serve({ port }, async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: applyCors(new Headers(), origin) });
  }

  if (!new URL(req.url).pathname.startsWith("/api/v1/")) {
    return new Response("Not Found", { status: 404, headers: applyCors(new Headers(), origin) });
  }

  const upstream = await fetch(`${internalUrl}${new URL(req.url).pathname}${new URL(req.url).search}`, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: applyCors(new Headers(upstream.headers), origin),
  });
});

// 4. Clean shutdown — kill the spawned bnd when this process exits
const shutdown = async () => {
  try { child.kill("SIGTERM"); } catch { /* already gone */ }
  try { await child.status; } catch { /* ignore */ }
  try { await server.shutdown(); } catch { /* ignore */ }
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

console.log(`staff rig HTTP launcher`);
console.log(`  public  : http://127.0.0.1:${port}/  (CORS: any localhost origin)`);
console.log(`  internal: ${internalUrl}/  (bnd node --http, no CORS)`);
console.log(`  rig     : ${RIG_PATH}`);
console.log(`  data    : ${Deno.env.get("STAFF_DATA_DIR") ?? `${Deno.env.get("HOME")}/.staff/fs`}`);
