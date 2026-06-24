/**
 * Validates the new rig contract: `rig.status().resources` is derived
 * from the rig's own per-verb route table (each connection's `patterns`),
 * NOT from downstream `node.status().resources`.
 *
 * See b3nd-core PR #19 follow-up: aggregator rewrite that pivots from
 * `node.status().resources` to `this.routes.{read,observe,receive}`.
 *
 * Why this lives in cc-chat: cc-chat's bootstrap dance (docs/bootstrap.md)
 * reads `result.resources` to find a writable + observable mount. We need
 * end-to-end confidence that the contract works for our use case, not just
 * that b3nd-core's unit tests pass in isolation.
 */

import { assertEquals } from "@std/assert";
import { connection, Rig } from "@bandeira-tech/b3nd-core";
import type {
  Output,
  ProtocolInterfaceNode,
  ReceiveResult,
  StatusResult,
} from "@bandeira-tech/b3nd-core/types";

/** Inert client — never asked to do anything; only its mere presence in a route matters. */
function stubNode(): ProtocolInterfaceNode {
  return {
    receive(_msgs: Output[]): Promise<ReceiveResult[]> {
      return Promise.resolve([]);
    },
    read<T = unknown>(_locators: string[]): Promise<Output<T>[]> {
      return Promise.resolve([]);
    },
    async *observe(): AsyncGenerator<readonly string[]> {
      // never yields
    },
    status(): Promise<StatusResult> {
      // CRUCIAL: deliberately do NOT report `resources` here. Under the new
      // contract the rig must NOT consult downstream node.status().resources.
      return Promise.resolve({ status: "healthy", schema: [], fns: [] });
    },
  };
}

Deno.test("rig.status().resources is derived from per-verb routes (read-only)", async () => {
  const node = stubNode();
  const conn = connection(node, ["a://", "b://"]);

  const rig = new Rig({
    routes: {
      read: [conn],
      // no observe, no receive routes
      observe: [],
      receive: [],
    },
  });

  const status = await rig.status();
  // Read prefixes surface, the other two verbs are omitted (no connections wired).
  assertEquals(status.resources, { read: ["a://", "b://"] });
});

Deno.test("rig.status().resources covers all three verbs when wired symmetrically", async () => {
  const node = stubNode();
  const conn = connection(node, ["immutable://**"]);

  const rig = new Rig({
    routes: {
      read: [conn],
      observe: [conn],
      receive: [conn],
    },
  });

  const status = await rig.status();
  assertEquals(status.resources, {
    read: ["immutable://**"],
    observe: ["immutable://**"],
    receive: ["immutable://**"],
  });
});

Deno.test("rig ignores downstream-reported resources (contract: rig is the source of truth)", async () => {
  // A misbehaving downstream that DOES report resources — the rig must
  // still derive from its own routes and ignore that.
  const liar: ProtocolInterfaceNode = {
    receive: (_: Output[]) => Promise.resolve([]),
    read: <T = unknown>(_: string[]) => Promise.resolve([] as Output<T>[]),
    observe: async function* () {},
    status: () =>
      Promise.resolve({
        status: "healthy" as const,
        schema: [],
        fns: [],
        resources: {
          read: ["LIES://"],
          observe: ["LIES://"],
          receive: ["LIES://"],
        },
      }),
  };
  const conn = connection(liar, ["truth://"]);
  const rig = new Rig({
    routes: { read: [conn], observe: [], receive: [] },
  });
  const status = await rig.status();
  assertEquals(status.resources, { read: ["truth://"] });
});

