/**
 * `eject` command — stop managing files with ai-skills.
 *
 * For each lockfile entry:
 *   - Inline-shim entries (have `shimTemplateId`): strip the managed-by header
 *     from the file, leaving just the canonical content. The file remains on
 *     disk but is no longer managed.
 *   - Copy entries and settings-merge entries: leave the file completely
 *     untouched. Just remove tracking.
 *
 * After processing all entries: delete the lockfile.
 *
 * Idempotent: if a file is already gone, print a notice and continue.
 * Idempotent on the lockfile: if no lockfile, print a notice and exit 0.
 *
 * Prints a final report of what was done.
 */

import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LockfileError, LOCKFILE_NAME, readLockfile } from "../lockfile.js";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface EjectOptions {
  /** Absolute path to the directory where files were installed. */
  installRoot: string;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export type EjectAction = "header-stripped" | "preserved" | "already-gone";

export interface EjectEntry {
  dest: string;
  action: EjectAction;
}

export interface EjectResult {
  entries: EjectEntry[];
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function runEject(options: EjectOptions): Promise<EjectResult> {
  const installRoot = resolve(options.installRoot);

  // ── Load lockfile ──────────────────────────────────────────────────────────
  let lockfile;
  try {
    lockfile = readLockfile(installRoot);
  } catch (err) {
    if (err instanceof LockfileError) {
      process.stderr.write(`ai-skills eject: ${err.message}\n`);
      return { entries: [] };
    }
    throw err;
  }

  if (lockfile === null) {
    process.stderr.write(`ai-skills eject: no lockfile found at ${installRoot}. Nothing to eject.\n`);
    return { entries: [] };
  }

  const results: EjectEntry[] = [];

  // ── Process each entry ─────────────────────────────────────────────────────
  for (const entry of lockfile.entries) {
    const filePath = join(installRoot, entry.dest);

    if (!existsSync(filePath)) {
      process.stdout.write(`GONE     ${entry.dest} (already deleted)\n`);
      results.push({ dest: entry.dest, action: "already-gone" });
      continue;
    }

    if (entry.shimTemplateId) {
      // Inline-shim: strip the managed-by header, keep the canonical content.
      const content = await readFile(filePath, "utf8");
      const stripped = stripManagedByHeader(content);
      await writeFile(filePath, stripped, "utf8");
      process.stdout.write(`STRIPPED ${entry.dest}\n`);
      results.push({ dest: entry.dest, action: "header-stripped" });
    } else {
      // Copy entry or settings-merge: leave file untouched.
      process.stdout.write(`KEPT     ${entry.dest}\n`);
      results.push({ dest: entry.dest, action: "preserved" });
    }
  }

  // ── Delete the lockfile ────────────────────────────────────────────────────
  await rm(join(installRoot, LOCKFILE_NAME), { force: true });
  process.stdout.write(`\nEjected ${results.length} component(s). Lockfile removed.\n`);

  return { entries: results };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip the ai-skills managed-by header from shim file content.
 *
 * Handles both hash-comment format (Cursor):
 *   # managed-by: ai-skills@<version> — do not edit; regenerated on upgrade
 *   # source: <path>
 *   <empty line>
 *   <content>
 *
 * And HTML-comment format (Copilot):
 *   <!-- managed-by: ai-skills@<version> — do not edit; regenerated on upgrade -->
 *   <!-- source: <path> -->
 *   <empty line>
 *   <content>
 *
 * Returns the content with the header removed. If no recognizable header is
 * found, returns the content unchanged.
 */
export function stripManagedByHeader(content: string): string {
  const lines = content.split("\n");
  let i = 0;

  const first = lines[i] ?? "";
  const isManagedBy =
    first.startsWith("# managed-by: ai-skills") ||
    first.startsWith("<!-- managed-by: ai-skills");

  if (!isManagedBy) {
    return content; // no header to strip
  }
  i++; // skip managed-by line

  // Skip source line
  const second = lines[i] ?? "";
  if (second.startsWith("# source:") || second.startsWith("<!-- source:")) {
    i++;
  }

  // Skip one blank separator line
  if ((lines[i] ?? "") === "") {
    i++;
  }

  return lines.slice(i).join("\n");
}
