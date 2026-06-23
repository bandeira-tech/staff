/**
 * observeWindow tests — the underlying primitive for cc_chat_observe
 * and cc_chat_who. Pure rig interactions, no MCP harness.
 */
import { assert, assertEquals } from "@std/assert";
import { createCcChatRig } from "../src/rig.ts";
import { observeWindow, rosterFromObserved } from "../src/observe-window.ts";
import { mintPresenceUri, mintStreamUri } from "../src/protocol.ts";

Deno.test("observeWindow collects URIs that fire during the window", async () => {
  const { rig, node } = createCcChatRig();
  try {
    const sender = (async () => {
      await new Promise((r) => setTimeout(r, 30));
      await rig.receive([
        [mintStreamUri("alice"), "hi"],
        [mintPresenceUri("bob"), "join"],
      ]);
    })();

    const observed = await observeWindow(rig, "cc-chat://**", 0.3);
    await sender;

    // Some of the bursts may land just inside the window depending on
    // timing; assert at least one delivery surfaced.
    assert(observed.length >= 1);
    for (const d of observed) {
      assert(d.uri.startsWith("cc-chat://"));
    }
  } finally {
    node.close();
  }
});

Deno.test("observeWindow honors the pattern filter", async () => {
  const { rig, node } = createCcChatRig();
  try {
    (async () => {
      await new Promise((r) => setTimeout(r, 20));
      await rig.receive([[mintStreamUri("noise"), "ignored"]]);
      await rig.receive([[mintPresenceUri("seen"), "join"]]);
    })();

    const observed = await observeWindow(rig, "cc-chat://presence/**", 0.2);
    assert(observed.length >= 1);
    for (const d of observed) {
      assert(d.uri.startsWith("cc-chat://presence/"));
    }
  } finally {
    node.close();
  }
});

Deno.test("observeWindow returns empty when nothing fires", async () => {
  const { rig, node } = createCcChatRig();
  try {
    const observed = await observeWindow(rig, "cc-chat://**", 0.1);
    assertEquals(observed, []);
  } finally {
    node.close();
  }
});

Deno.test("rosterFromObserved splits names by channel", () => {
  const r = rosterFromObserved([
    { uri: "cc-chat://stream/alice/20260623120000-aaaaaa", payload: "hi" },
    { uri: "cc-chat://stream/alice/20260623120001-bbbbbb", payload: "again" },
    { uri: "cc-chat://presence/bob/20260623120002-cccccc", payload: "join" },
    { uri: "cc-chat://presence/alice/20260623120003-dddddd", payload: "leave" },
    { uri: "cc-chat://garbage/x", payload: "ignored" }, // unparseable
  ]);
  assertEquals(r.names, ["alice", "bob"]);
  assertEquals(r.speaking, ["alice"]);
  assertEquals(r.presence, ["alice", "bob"]);
});

Deno.test("rosterFromObserved tolerates an empty input", () => {
  assertEquals(rosterFromObserved([]), {
    names: [],
    speaking: [],
    presence: [],
  });
});
