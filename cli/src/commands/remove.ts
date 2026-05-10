/**
 * `remove <id...>` command — remove installed components.
 *
 * For each matching lockfile entry:
 *   - settings-merge entries: leave the file on disk; remove tracking only.
 *     (The settings file belongs to the user; deleting it would be destructive.)
 *   - copy / inline-shim entries: check if the on-disk file matches the sha
 *     recorded in the lockfile.
 *       - sha matches → delete silently.
 *       - sha doesn't match (user edited or file drifted) → prompt unless
 *         `--yes` or `--force` is set.
 *       - file already gone → skip (idempotent).
 *
 * Orphan check (requires manifest):
 *   If other installed components declare `dependsOn` that includes the
 *   component being removed, refuse to remove unless `--cascade` is passed
 *   (which also removes the dependents) or `--force` (removes, leaves
 *   dependents potentially broken).
 *
 * Lockfile is rewritten (atomically) after all removals.
 * Exit 0 on success; throws on unrecoverable error.
 */

import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalSha256 } from "../sha.js";
import { reprojectUpstream, type JsonObject } from "../settings-merge.js";
import {
  buildLockfile,
  type LockfileEntry,
  LockfileError,
  readLockfile,
  writeLockfile,
} from "../lockfile.js";
import { type Manifest } from "../manifest-schema.js";
import { loadManifest } from "../manifest.js";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface RemoveOptions {
  /** Absolute path to the directory where files were installed. */
  installRoot: string;
  /** Component ids to remove (exact match only; no globs). */
  ids: string[];
  /**
   * Non-interactive: delete even when the on-disk sha has drifted from the
   * lockfile value. Equivalent to `--force` for the sha-mismatch prompt.
   */
  yes?: boolean;
  /**
   * Force removal: delete files even if on-disk sha has drifted, and leave
   * dependent components in the lockfile in a potentially broken state.
   */
  force?: boolean;
  /**
   * When set, also remove components that depend on the removed ones
   * (cascading removal). Without this flag, orphan detection causes an error.
   */
  cascade?: boolean;
  /** Path to a local manifest.json — enables orphan detection. */
  manifestPath?: string;
  // ── Test injection ──────────────────────────────────────────────────────
  /** Called when on-disk sha differs from lockfile sha. Return "delete" or "skip". */
  onDriftedFile?: (dest: string) => Promise<"delete" | "skip">;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export type RemoveAction = "deleted" | "preserved" | "already-gone" | "skipped";

export interface RemoveEntry {
  id: string;
  target: string;
  dest: string;
  action: RemoveAction;
}

export interface RemoveResult {
  entries: RemoveEntry[];
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function runRemove(options: RemoveOptions): Promise<RemoveResult> {
  const installRoot = resolve(options.installRoot);

  // ── Load lockfile ──────────────────────────────────────────────────────────
  let lockfile;
  try {
    lockfile = readLockfile(installRoot);
  } catch (err) {
    if (err instanceof LockfileError) {
      throw new Error(err.message);
    }
    throw err;
  }

  if (lockfile === null) {
    throw new Error(
      `No lockfile found at ${installRoot}. Run \`ai-skills init\` first.`,
    );
  }

  // ── Find matching entries ──────────────────────────────────────────────────
  const idSet = new Set(options.ids);
  const toRemove = lockfile.entries.filter((e) => idSet.has(e.id));
  const toRemoveKeys = new Set(toRemove.map((e) => `${e.id}:${e.target}`));

  if (toRemove.length === 0) {
    const quoted = options.ids.map((id) => `"${id}"`).join(", ");
    throw new Error(`No installed components matched ${quoted}.`);
  }

  // ── Orphan detection (optional — requires manifest) ───────────────────────
  if (options.manifestPath && !options.force) {
    let manifest: Manifest;
    try {
      manifest = await loadManifest(resolve(options.manifestPath));
    } catch {
      manifest = { components: [] } as unknown as Manifest;
    }

    const installedIds = new Set(lockfile.entries.map((e) => e.id));
    const orphans: string[] = [];

    for (const component of manifest.components) {
      if (toRemoveKeys.has(`${component.id}:${component.id}`)) continue; // being removed
      if (!installedIds.has(component.id)) continue; // not installed
      // Check if this installed component depends on any being removed
      for (const dep of component.dependsOn ?? []) {
        if (idSet.has(dep)) {
          orphans.push(component.id);
          break;
        }
      }
    }

    if (orphans.length > 0) {
      if (!options.cascade) {
        throw new Error(
          `Cannot remove: the following installed components depend on ${[...idSet].join(", ")}: ` +
            `${orphans.join(", ")}. ` +
            `Pass --cascade to remove them too, or --force to remove anyway.`,
        );
      }
      // Cascade: also remove the orphaned dependents
      for (const orphanId of orphans) {
        idSet.add(orphanId);
        for (const entry of lockfile.entries) {
          if (entry.id === orphanId) {
            toRemove.push(entry);
            toRemoveKeys.add(`${entry.id}:${entry.target}`);
          }
        }
      }
    }
  }

  // ── Process each entry ─────────────────────────────────────────────────────
  const results: RemoveEntry[] = [];

  for (const entry of toRemove) {
    const filePath = join(installRoot, entry.dest);

    // settings-merge: never delete the file, just remove tracking
    if (entry.kind === "settings-merge") {
      process.stdout.write(`PRESERVED  ${entry.dest} (settings file kept on disk)\n`);
      results.push({ id: entry.id, target: entry.target, dest: entry.dest, action: "preserved" });
      continue;
    }

    if (!existsSync(filePath)) {
      process.stdout.write(`GONE       ${entry.dest} (already deleted)\n`);
      results.push({ id: entry.id, target: entry.target, dest: entry.dest, action: "already-gone" });
      continue;
    }

    // Check if file has drifted from lockfile sha
    const buf = await readFile(filePath);
    const diskSha = canonicalSha256(buf);
    const hasDrifted = diskSha !== entry.sha256;

    if (hasDrifted && !options.yes && !options.force) {
      let choice: "delete" | "skip";
      if (options.onDriftedFile) {
        choice = await options.onDriftedFile(entry.dest);
      } else {
        // Interactive prompt
        const { confirm } = await import("@inquirer/prompts");
        const del = await confirm({
          message: `"${entry.dest}" has been modified since install. Delete anyway?`,
          default: false,
        });
        choice = del ? "delete" : "skip";
      }

      if (choice === "skip") {
        process.stdout.write(`SKIPPED    ${entry.dest} (modified — keeping)\n`);
        results.push({ id: entry.id, target: entry.target, dest: entry.dest, action: "skipped" });
        continue;
      }
    }

    await rm(filePath, { force: true });
    process.stdout.write(`REMOVED    ${entry.dest}\n`);
    results.push({ id: entry.id, target: entry.target, dest: entry.dest, action: "deleted" });
  }

  // ── Rewrite lockfile ───────────────────────────────────────────────────────
  // Remove entries that were successfully deleted or preserved (not skipped).
  const removedDests = new Set(
    results
      .filter((r) => r.action !== "skipped")
      .map((r) => `${r.id}:${r.target}`),
  );

  const keptEntries: LockfileEntry[] = lockfile.entries.filter(
    (e) => !removedDests.has(`${e.id}:${e.target}`),
  );

  const newLockfile = buildLockfile(keptEntries, lockfile.manifestVersion, lockfile.ref);
  await writeLockfile(installRoot, newLockfile);

  const deletedCount = results.filter((r) => r.action === "deleted").length;
  const preservedCount = results.filter((r) => r.action === "preserved").length;
  const skippedCount = results.filter((r) => r.action === "skipped").length;
  const parts: string[] = [];
  if (deletedCount > 0) parts.push(`removed ${deletedCount} file(s)`);
  if (preservedCount > 0) parts.push(`preserved ${preservedCount} settings file(s)`);
  if (skippedCount > 0) parts.push(`skipped ${skippedCount} (modified)`);
  process.stdout.write(`\nDone — ${parts.join(", ") || "nothing changed"}.\n`);

  return { entries: results };
}
