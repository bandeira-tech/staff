#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * bnd-cc-chat tail — terminal viewer for the cc-chat present stream.
 *
 *   deno task tail
 *   deno task tail --url http://127.0.0.1:7373
 *   deno task tail --room 20260624120000-test
 *   deno task tail --url http://host:port --root immutable://open/cc-chat/ --room 20260624120000-demo
 *
 * Flags:
 *   --url   <u>   Rig HTTP URL (default env CC_CHAT_URL or http://127.0.0.1:7373)
 *   --root  <r>   URI root (default immutable://open/cc-chat/)
 *   --room  <r>   Room in <ts>-<slug> format; when present, narrows to that room only
 *
 * Joins the rig, observes the pattern, prints each delivery as it lands.
 * Like `tail -f` for the chat — no history, just what arrives.
 */
import { tail, roomPattern } from "../src/tail.ts";
import type { TailDelivery } from "../src/tail.ts";

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
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

const argv = [...Deno.args];
const url = arg("--url", argv) ?? Deno.env.get("CC_CHAT_URL") ?? "http://127.0.0.1:7373";
const root = arg("--root", argv) ?? "immutable://open/cc-chat/";
const room = arg("--room", argv);

const pattern = room ? roomPattern(root, room) : `${root}**`;

const abort = new AbortController();
Deno.addSignalListener("SIGINT", () => abort.abort());

console.error(`tailing ${url} for ${pattern} — Ctrl-C to stop`);

function formatDelivery(d: TailDelivery): string {
  const t = new Date();
  const ts = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
  const preview = d.payload ? d.payload.slice(0, 80) + (d.payload.length > 80 ? "…" : "") : "";

  if (!d.parsed) {
    return `${DIM}${ts}${RESET} ${DIM}(unparsed)${RESET} ${d.uri} ${preview}`;
  }

  const p = d.parsed;

  switch (p.type) {
    case "meta":
      return `${DIM}${ts}${RESET} ${DIM}[meta]${RESET} room=${p.room}`;

    case "join":
      return `${DIM}${ts}${RESET} ${VIOLET}${p.who}${RESET} ${DIM}joined${RESET} ${DIM}room=${p.room}${RESET}`;

    case "end":
      return `${DIM}${ts}${RESET} ${VIOLET}${p.who}${RESET} ${DIM}ended${RESET} ${DIM}room=${p.room}${RESET}`;

    case "msg":
      return `${DIM}${ts}${RESET} ${GREEN}${p.who}${RESET} ${preview}`;

    case "mention":
      return `${DIM}${ts}${RESET} ${GREEN}${p.who}${RESET} ${CYAN}→${p.target}${RESET} ${preview}`;

    case "pause":
      return `${DIM}${ts}${RESET} ${YELLOW}[pause]${RESET} ${DIM}room=${p.room}${RESET}`;

    case "resume":
      return `${DIM}${ts}${RESET} ${YELLOW}[resume]${RESET} ${DIM}room=${p.room}${RESET}`;

    case "output":
      return `${DIM}${ts}${RESET} ${CYAN}[output]${RESET} ${DIM}slug=${p.slug}${RESET} ${preview}`;

    default:
      return `${DIM}${ts}${RESET} ${d.uri} ${preview}`;
  }
}

try {
  for await (const d of tail({ url, root, pattern, signal: abort.signal })) {
    console.log(formatDelivery(d));
  }
} catch (e) {
  if (!abort.signal.aborted) {
    console.error("tail error:", e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
