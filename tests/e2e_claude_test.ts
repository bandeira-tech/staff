/**
 * e2e test — drive the full agent flow through `claude --print`.
 *
 * Gated by `CC_CHAT_E2E=1` (and optionally `CC_CHAT_CLAUDE` path) because
 * each run spawns Claude Code and costs API tokens. Skipped by default so
 * `deno task test` stays free + fast.
 *
 * What it proves:
 *   1. The plugin loads via --plugin-dir.
 *   2. The MCP server connects to a rig at $CC_CHAT_URL.
 *   3. The agent uses the cc-chat skill to call cc_chat_observe.
 *   4. Deliveries posted during the window come back with payloads.
 *
 * Run:
 *   CC_CHAT_E2E=1 deno test --allow-all tests/e2e_claude_test.ts
 */
import { assert, assertStringIncludes } from "@std/assert";
import { HttpClient } from "@bandeira-tech/b3nd-move/http/client";
import { startServer } from "../src/serve.ts";
import { mintPresenceUri, mintStreamUri } from "../src/protocol.ts";

const SHOULD_RUN = Deno.env.get("CC_CHAT_E2E") === "1";
const CLAUDE = Deno.env.get("CC_CHAT_CLAUDE") ?? "claude";
const PLUGIN_DIR = new URL("../plugin", import.meta.url).pathname;

async function spawnObserver(
  url: string,
  seconds: number,
): Promise<Deno.CommandOutput> {
  // The agent gets a tight instruction so the output is parseable.
  const prompt =
    `Use the cc-chat MCP tools. Call cc_chat_observe with seconds=${seconds} and pattern "cc-chat://**". ` +
    `Output ONLY the raw JSON object returned by the tool, with no commentary, no markdown, no prose.`;

  const mcpConfig = JSON.stringify({
    mcpServers: {
      "cc-chat": {
        command: "deno",
        args: ["run", "-A", `${PLUGIN_DIR}/.claude-plugin/mcp-server/mod.ts`],
        env: { CC_CHAT_URL: url },
      },
    },
  });

  const tmp = await Deno.makeTempFile({ prefix: "cc-chat-mcp-", suffix: ".json" });
  await Deno.writeTextFile(tmp, mcpConfig);

  try {
    const cmd = new Deno.Command(CLAUDE, {
      args: [
        "--print",
        "--dangerously-skip-permissions",
        "--mcp-config",
        tmp,
        "--plugin-dir",
        PLUGIN_DIR,
        prompt,
      ],
      stdout: "piped",
      stderr: "piped",
      env: { ...Deno.env.toObject(), CC_CHAT_URL: url },
    });
    return await cmd.output();
  } finally {
    try { await Deno.remove(tmp); } catch { /* ignore */ }
  }
}

Deno.test({
  name: "e2e: agent observes live deliveries via claude --print",
  ignore: !SHOULD_RUN,
  // Claude cold-start + the observe window dominate this; give it room.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const server = startServer({ port: 0 });
    try {
      // Claude cold-starts ~15s before cc_chat_observe is actually
      // listening; send a burst that straddles the expected window.
      const sender = new HttpClient({ url: server.url });
      const send = (async () => {
        const enc = new TextEncoder();
        const sendOne = async () => {
          await sender.receive([
            [mintStreamUri("e2etest"), enc.encode("e2e-message-one")],
          ]);
          await sender.receive([
            [mintPresenceUri("e2etest"), enc.encode("join")],
          ]);
        };
        // Three bursts at 18s, 26s, 34s — covers a 30s observe window that
        // begins anywhere in the 15–35s range.
        await new Promise((r) => setTimeout(r, 18000));
        await sendOne();
        await new Promise((r) => setTimeout(r, 8000));
        await sendOne();
        await new Promise((r) => setTimeout(r, 8000));
        await sendOne();
      })();

      const observe = spawnObserver(server.url, 30);

      const [, out] = await Promise.all([send, observe]);
      const decoder = new TextDecoder();
      const stdout = decoder.decode(out.stdout);
      const stderr = decoder.decode(out.stderr);

      // Soft-skip on transient upstream Claude errors so this test isn't
      // flaky-red. It's an *integration* probe — it should not fail when
      // claude.com is overloaded.
      const transient = /API Error: 5\d\d|Overloaded|rate.?limit/i;
      if (out.code !== 0 && transient.test(stdout)) {
        console.warn("e2e skipped: transient claude API error\n", stdout.slice(0, 200));
        return;
      }

      if (out.code !== 0) {
        console.error("claude exited", out.code, "\nstdout:\n", stdout, "\nstderr:\n", stderr);
      }
      assert(out.code === 0, `claude exited with ${out.code}`);

      assertStringIncludes(stdout, "e2etest");
      assertStringIncludes(stdout, "e2e-message-one");
    } finally {
      await server.shutdown();
    }
  },
});
