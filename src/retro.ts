/**
 * @module
 * cc-chat retro — the "growing roles" learning loop.
 *
 * After a coordination delivers, the manager (or `/cc-chat:role-retro`)
 * dispatches a `retro-pass` subagent that reads the room, proposes diffs
 * against each summoned participant's resolved role file, and writes the
 * proposed-new bodies as files on disk for an AskUserQuestion approval
 * loop. See design-spec §5 for the canonical flow.
 *
 * This module is the bookkeeping side: idempotency check, version bump,
 * path resolution for proposals. The "compose a proposed diff from room
 * text" step is the agent's responsibility — that's prose-judgement work,
 * not deterministic code.
 */

import { parseRoleFile, type ResolvedRole } from "./roles.ts";

export interface ParticipantRecord {
  /** Participant name = role slug. */
  name: string;
  /** Resolved role file at dispatch time, or null if off-the-cuff. */
  roleFile: ResolvedRole | null;
}

/**
 * Idempotency check per design-spec §5.0.
 *
 * Auto-retro on a room is skipped if every summoned role's resolved file
 * already lists this room in its `sourced_from` — i.e. the role has
 * already absorbed this room's learning. Re-running is a no-op.
 *
 * Note: design-spec §5.0 phrased the rule arithmetically as
 * `version > <count of room appearances>`. That formula trips on the
 * very first retro of a never-absorbed room (v1, 0 appearances → 1>0
 * → would skip on the *first* run). The intent is the membership check
 * we implement here; if you want the arithmetic variant later, the
 * delta is local to this function.
 *
 * Returns:
 *   - `{ skip: true,  reason }` — every role's `sourced_from` already
 *     contains this room slug
 *   - `{ skip: false, reason }` — at least one role hasn't absorbed yet,
 *     or there are participants with no resolved role file (potential
 *     new seed candidates)
 *
 * Manual invocations (`/cc-chat:role-retro <room>`) should ignore this
 * check; auto-retro from the manager honors it.
 */
export function shouldSkipAutoRetro(
  roomSlug: string,
  participants: ParticipantRecord[],
): { skip: boolean; reason: string } {
  if (participants.length === 0) {
    return {
      skip: false,
      reason: "no participants; retro has nothing to absorb",
    };
  }
  const offTheCuff = participants.filter((p) => p.roleFile === null);
  if (offTheCuff.length > 0) {
    return {
      skip: false,
      reason:
        `${offTheCuff.length} participant(s) ran off-the-cuff (no role file); retro may propose seeds`,
    };
  }
  for (const p of participants) {
    const fm = p.roleFile!.file.frontmatter;
    const absorbed = (fm.sourced_from ?? []).some((r) =>
      // Tolerate trailing " (...)" annotations like "<room> (this room's qa is currently active)".
      r === roomSlug || r.startsWith(`${roomSlug} `)
    );
    if (!absorbed) {
      return {
        skip: false,
        reason:
          `role "${fm.slug}" has not absorbed this room (sourced_from missing "${roomSlug}")`,
      };
    }
  }
  return {
    skip: true,
    reason: "skipping retro — all roles have already absorbed learnings from this room",
  };
}

/**
 * Where the retro-pass writes a proposal for a given role slug. Lives next
 * to the room ledger, in the working tree, not in the chat — per design-
 * spec §5.2 / §7.7 ("retro proposes via files, not chat").
 */
export function proposalPath(
  projectRoot: string,
  roomSlug: string,
  slug: string,
): string {
  return `${projectRoot}/.cc-chat/${roomSlug}/retro/${slug}.proposed.md`;
}

/**
 * Apply a proposed body to the resolved role file path, bumping `version`
 * and updating `updated`. Adds `roomSlug` to `sourced_from` if absent.
 * Returns the new file body that was written.
 *
 * Design-spec §5.4 ("Accept"): write to *the same path that dispatch
 * resolved* (follow precedence — forks receive the learning, not the
 * plugin original).
 */
export interface ApplyAcceptInput {
  proposedRaw: string;
  targetPath: string;
  roomSlug: string;
  /** ISO-8601 UTC; defaults to `new Date().toISOString()`. */
  now?: string;
}

export function buildAcceptedBody(input: ApplyAcceptInput): string {
  const now = input.now ?? new Date().toISOString();
  // Parse the proposed body to validate + extract structure.
  const parsed = parseRoleFile(input.proposedRaw, input.targetPath);
  const fm = { ...parsed.frontmatter };

  fm.version = (fm.version ?? 0) + 1;
  fm.updated = now;

  const existing = fm.sourced_from ?? [];
  const already = existing.some((r) => r === input.roomSlug || r.startsWith(`${input.roomSlug} `));
  fm.sourced_from = already ? existing : [...existing, input.roomSlug];

  return renderFrontmatter(fm) + parsed.body;
}

function renderFrontmatter(fm: {
  slug: string;
  summary: string;
  sourced_from?: string[];
  status?: string;
  version?: number;
  updated?: string;
}): string {
  const lines: string[] = ["---"];
  lines.push(`slug: ${fm.slug}`);
  lines.push(`summary: ${fm.summary}`);
  if (fm.sourced_from && fm.sourced_from.length > 0) {
    lines.push("sourced_from:");
    for (const r of fm.sourced_from) lines.push(`  - ${r}`);
  }
  if (fm.status) lines.push(`status: ${fm.status}`);
  if (fm.version !== undefined) lines.push(`version: ${fm.version}`);
  if (fm.updated) lines.push(`updated: ${fm.updated}`);
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}
