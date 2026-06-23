/**
 * @module
 * cc-chat Rig factory.
 *
 * Wraps a `PresentChatNode` in a b3nd `Rig` so it can be served via any
 * b3nd-move transport (HTTP today; WS / gRPC / MCP without changing this
 * file). Routes the single in-process node for receive / read / observe.
 */
import { connection, Rig } from "@bandeira-tech/b3nd-core";
import {
  PresentChatNode,
  type PresentChatNodeOptions,
} from "./node.ts";

export interface CreateRigOptions extends PresentChatNodeOptions {}

export interface CreatedRig {
  rig: Rig;
  node: PresentChatNode;
}

export function createCcChatRig(opts: CreateRigOptions = {}): CreatedRig {
  const node = new PresentChatNode(opts);
  const conn = connection(node, ["cc-chat://**"], { id: "present-chat" });
  const rig = new Rig({
    routes: { receive: [conn], read: [conn], observe: [conn] },
  });
  return { rig, node };
}
