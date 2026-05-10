/**
 * `list` command — show installed, available, and outdated components.
 *
 * Sections:
 *   Installed   — components tracked in the lockfile.
 *   Available   — components in the manifest not currently installed.
 *   Outdated    — installed components whose manifest sha256 differs from the
 *                 lockfile sha256 (copy/shim entries only; settings-merge entries
 *                 are excluded from outdated detection in v1).
 *
 * When no manifest is provided, only the Installed section is shown (offline mode).
 *
 * `--json` emits a stable JSON schema (schemaVersion: 1) to stdout.
 */

import { resolve } from "node:path";
import { type LockfileEntry, LockfileError, readLockfile } from "../lockfile.js";
import { loadManifest } from "../manifest.js";
import { type Component, type Manifest } from "../manifest-schema.js";
import {
  assertRegistryTrust,
  DEFAULT_REGISTRY,
  fetchRelease,
} from "../fetch.js";
import { validateRef, RefValidationError } from "../ref-validator.js";
import { rm } from "node:fs/promises";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ListOptions {
  /** Absolute path to the directory where files were installed. */
  installRoot: string;
  /** Path to a local manifest.json (enables Available + Outdated sections). */
  manifestPath?: string;
  /** Git ref to fetch manifest from GitHub. */
  ref?: string;
  /** GitHub registry in owner/repo format. */
  registry?: string;
  /** Required when registry is non-default. */
  registryTrust?: boolean;
  /** Emit JSON output instead of human-readable text. */
  json?: boolean;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface InstalledItem {
  id: string;
  target: string;
  dest: string;
  kind: string;
  sha256: string;
  adopted?: true;
}

export interface AvailableItem {
  id: string;
  type: string;
  description?: string;
}

export interface OutdatedItem {
  id: string;
  target: string;
  dest: string;
  installedSha: string;
  manifestSha: string;
}

export interface ListResult {
  installed: InstalledItem[];
  available: AvailableItem[];
  outdated: OutdatedItem[];
}

// ─── JSON schema ──────────────────────────────────────────────────────────────

export const LIST_JSON_SCHEMA_VERSION = 1;

// ─── Command ──────────────────────────────────────────────────────────────────

export async function runList(options: ListOptions): Promise<ListResult> {
  const installRoot = resolve(options.installRoot);

  // ── Load lockfile ──────────────────────────────────────────────────────────
  let lockfileEntries: LockfileEntry[] = [];
  try {
    const lock = readLockfile(installRoot);
    lockfileEntries = lock?.entries ?? [];
  } catch (err) {
    if (err instanceof LockfileError) {
      process.stderr.write(`ai-skills list: ${err.message}\n`);
    } else {
      throw err;
    }
  }

  // ── Load manifest (optional) ───────────────────────────────────────────────
  let manifest: Manifest | null = null;
  let extractDir: string | null = null;

  if (options.manifestPath) {
    manifest = await loadManifest(resolve(options.manifestPath));
  } else if (options.ref) {
    let validatedRef;
    try {
      validatedRef = validateRef(options.ref);
    } catch (err) {
      if (err instanceof RefValidationError) {
        throw new Error(err.message);
      }
      throw err;
    }
    const registry = options.registry ?? DEFAULT_REGISTRY;
    assertRegistryTrust(registry, options.registryTrust ?? false);
    try {
      const result = await fetchRelease({ registry, ref: validatedRef.ref });
      extractDir = result.extractDir;
      manifest = result.manifest;
    } finally {
      if (extractDir) {
        await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  // ── Build sections ─────────────────────────────────────────────────────────

  const installed: InstalledItem[] = lockfileEntries.map((e) => ({
    id: e.id,
    target: e.target,
    dest: e.dest,
    kind: e.kind ?? "file",
    sha256: e.sha256,
    ...(e.adopted ? { adopted: true as const } : {}),
  }));

  const available: AvailableItem[] = [];
  const outdated: OutdatedItem[] = [];

  if (manifest) {
    const installedKeys = new Set(lockfileEntries.map((e) => `${e.id}:${e.target}`));

    // Available: manifest components not installed for any target
    const componentAvailable = new Map<string, Component>();
    for (const component of manifest.components) {
      for (const targetId of Object.keys(component.installs)) {
        const key = `${component.id}:${targetId}`;
        if (!installedKeys.has(key)) {
          // Not installed for this target — mark as available once per component
          if (!componentAvailable.has(component.id)) {
            componentAvailable.set(component.id, component);
          }
        }
      }
    }
    for (const component of componentAvailable.values()) {
      available.push({
        id: component.id,
        type: component.type,
        ...(component.description ? { description: component.description } : {}),
      });
    }

    // Outdated: installed copy/shim entries where manifest sha differs
    const manifestById = new Map(manifest.components.map((c) => [c.id, c]));
    for (const entry of lockfileEntries) {
      if (entry.kind === "settings-merge") continue; // excluded in v1
      const manifestComponent = manifestById.get(entry.id);
      if (!manifestComponent) continue; // component removed from manifest
      // For shim entries, compare shimCanonicalSha to manifest sha
      const compareAgainst = entry.shimCanonicalSha ?? entry.sha256;
      if (compareAgainst !== manifestComponent.sha256) {
        outdated.push({
          id: entry.id,
          target: entry.target,
          dest: entry.dest,
          installedSha: compareAgainst,
          manifestSha: manifestComponent.sha256,
        });
      }
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  if (options.json) {
    process.stdout.write(
      JSON.stringify({ schemaVersion: LIST_JSON_SCHEMA_VERSION, installed, available, outdated }, null, 2) + "\n",
    );
  } else {
    printHuman(installed, available, outdated);
  }

  return { installed, available, outdated };
}

// ─── Human output ─────────────────────────────────────────────────────────────

function printHuman(
  installed: InstalledItem[],
  available: AvailableItem[],
  outdated: OutdatedItem[],
): void {
  if (installed.length === 0 && available.length === 0) {
    process.stdout.write("No components installed and no manifest loaded.\n");
    process.stdout.write("Run `ai-skills init` to install, or pass --manifest/--ref to see available components.\n");
    return;
  }

  if (installed.length > 0) {
    process.stdout.write("Installed:\n");
    for (const item of installed) {
      const adoptedFlag = item.adopted ? " [adopted]" : "";
      const kindLabel = item.kind === "settings-merge" ? " [settings-merge]" : "";
      process.stdout.write(`  ${item.id} (${item.target})${adoptedFlag}${kindLabel}\n`);
    }
  } else {
    process.stdout.write("Installed: (none)\n");
  }

  if (outdated.length > 0) {
    process.stdout.write("\nOutdated:\n");
    for (const item of outdated) {
      process.stdout.write(`  ${item.id} (${item.target}) — run \`ai-skills add --force ${item.id}\` to update\n`);
    }
  }

  if (available.length > 0) {
    process.stdout.write("\nAvailable:\n");
    for (const item of available) {
      const desc = item.description ? ` — ${item.description}` : "";
      process.stdout.write(`  ${item.id} [${item.type}]${desc}\n`);
    }
  }
}
