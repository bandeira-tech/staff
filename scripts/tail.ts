#!/usr/bin/env -S deno run --allow-net
/**
 * bnd-cc-chat tail — terminal viewer for the cc-chat present stream.
 *
 *   deno task tail
 *   deno task tail --url http://127.0.0.1:7373
 *   deno task tail --pattern cc-chat://stream/writer/**
 *   deno task tail --json
 *
 * Joins the rig, observes the pattern, prints each delivery as it lands.
 * Like `tail -f` for the chat — no history, just what arrives.
 */
import { tail } from "../src/tail.ts";
import { parseUri } from "../src/protocol.ts";

function arg(flag: string, argv: string[]): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const VIOLET = "\x1b[35m";

const argv = [...Deno.args];
const url = arg("--url", argv) ?? Deno.env.get("CC_CHAT_URL") ?? "http://127.0.0.1:7373";
const pattern = arg("--pattern", argv) ?? "cc-chat://**";
const asJson = argv.includes("--json");

const abort = new AbortController();
Deno.addSignalListener("SIGINT", () => abort.abort());

console.error(`tailing ${url} for ${pattern} — Ctrl-C to stop`);

try {
  for await (const { uri, payload } of tail({ url, pattern, signal: abort.signal })) {
    if (asJson) {
      console.log(JSON.stringify({ uri, payload }));
      continue;
    }
    const t = new Date();
    const ts = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    const parsed = parseUri(uri);
    if (!parsed) {
      console.log(`${DIM}${ts}${RESET} ${uri} ${payload ?? ""}`);
      continue;
    }
    if (parsed.kind === "presence") {
      const verb = payload === "join" ? "joined" : payload === "leave" ? "left" : (payload ?? "");
      console.log(`${DIM}${ts}${RESET} ${VIOLET}${parsed.name}${RESET} ${DIM}${verb}${RESET}`);
    } else {
      console.log(`${DIM}${ts}${RESET} ${GREEN}${parsed.name}${RESET} ${payload ?? ""}`);
    }
  }
} catch (e) {
  if (!abort.signal.aborted) {
    console.error("tail error:", e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
