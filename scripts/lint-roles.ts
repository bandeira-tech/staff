#!/usr/bin/env -S deno run --allow-read
/**
 * Lint every role file under plugin/skills/cc-chat/roles/ and (if present)
 * .claude/cc-chat/roles/. Exits 1 if any error issues are found.
 *
 * Usage:
 *   deno run --allow-read scripts/lint-roles.ts
 *   deno run --allow-read scripts/lint-roles.ts <project-root>
 *
 * Default project root is `cwd`; the plugin root is derived as `<cwd>/plugin`.
 */

import { lintRoleFile, parseRoleFile } from "../src/roles.ts";

const projectRoot = Deno.args[0] ?? Deno.cwd();
const dirs = [
  `${projectRoot}/.claude/cc-chat/roles`,
  `${projectRoot}/plugin/skills/cc-chat/roles`,
];

let errors = 0;
let warns = 0;
let checked = 0;

for (const dir of dirs) {
  let entries: Deno.DirEntry[] = [];
  try {
    for await (const e of Deno.readDir(dir)) entries.push(e);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) continue;
    throw e;
  }
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith(".md")) continue;
    const path = `${dir}/${e.name}`;
    const slugMatch = e.name.match(/^([a-z0-9][a-z0-9-]{0,31})\.md$/);
    if (!slugMatch) {
      console.error(`error: ${path}: filename does not match <slug>.md`);
      errors++;
      continue;
    }
    const expectedSlug = slugMatch[1];
    const raw = await Deno.readTextFile(path);
    let file;
    try {
      file = parseRoleFile(raw, path);
    } catch (err) {
      console.error(`error: ${(err as Error).message}`);
      errors++;
      continue;
    }
    checked++;
    const issues = lintRoleFile(file, expectedSlug);
    for (const issue of issues) {
      if (issue.kind === "error") {
        console.error(`error: ${issue.message}`);
        errors++;
      } else {
        console.warn(`warn:  ${issue.message}`);
        warns++;
      }
    }
  }
}

console.log(`\nchecked ${checked} role files: ${errors} error(s), ${warns} warning(s).`);
if (errors > 0) Deno.exit(1);
