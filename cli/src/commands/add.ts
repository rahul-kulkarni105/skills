/**
 * `add <id...>` command — add specific components to an existing installation.
 *
 * ID resolution (in order):
 *   1. If the argument matches a bundle id: expand to all component ids in
 *      that bundle (filtered to installable components for the target).
 *   2. If the argument contains `*` or `?`: treat as a glob; match against
 *      component ids.
 *   3. Otherwise: exact component id match.
 *
 * Already-installed check: for each (component, target) pair that would be
 * installed, if a lockfile entry already exists for that pair, skip it unless
 * `--force` is passed.
 *
 * Reuses `runInit` with `preserveExistingEntries: true` so previously-
 * installed components are not evicted from the lockfile.
 *
 * Exit codes (via thrown errors):
 *   0 — all specified components added (or already installed).
 *   1 — error (unknown id, no manifest, etc.).
 */

import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import {
  assertRegistryTrust,
  DEFAULT_REGISTRY,
  fetchRelease,
} from "../fetch.js";
import { validateRef, RefValidationError } from "../ref-validator.js";
import { loadManifest } from "../manifest.js";
import { readLockfile } from "../lockfile.js";
import { type Manifest } from "../manifest-schema.js";
import { runInit, type InitOptions } from "./init.js";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface AddOptions {
  /** Absolute path to the directory where files will be installed. */
  installRoot: string;
  /** Component ids, globs, or bundle ids to add. */
  ids: string[];
  /** Path to a local manifest.json. */
  manifestPath?: string;
  /** Git ref to fetch manifest from GitHub. */
  ref?: string;
  /** GitHub registry in owner/repo format. */
  registry?: string;
  /** Required when registry is non-default. */
  registryTrust?: boolean;
  /** Skip cosign verification. */
  noVerify?: boolean;
  /** Non-interactive: overwrite existing, accept defaults. */
  yes?: boolean;
  /** Install into user home directory; skip project-scoped targets. */
  userMode?: boolean;
  /** Pre-selected target ids. */
  targets?: string[];
  /** Re-install even if already present in the lockfile. */
  force?: boolean;
  // ── Test injection ──────────────────────────────────────────────────────
  onExistingFile?: InitOptions["onExistingFile"];
  onDenyRule?: InitOptions["onDenyRule"];
  onConflict?: InitOptions["onConflict"];
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function runAdd(options: AddOptions): Promise<void> {
  const installRoot = resolve(options.installRoot);

  // ── Load manifest ──────────────────────────────────────────────────────────
  let manifest: Manifest;
  let repoRoot: string;
  let extractDir: string | null = null;
  let ref: string | undefined;
  let verifiedAt: string | null = null;

  try {
    if (options.manifestPath) {
      const { dirname: pathDirname, resolve: pathResolve } = await import("node:path");
      const resolvedPath = pathResolve(options.manifestPath);
      repoRoot = pathDirname(resolvedPath);
      manifest = await loadManifest(resolvedPath);
    } else if (options.ref) {
      let validatedRef;
      try {
        validatedRef = validateRef(options.ref);
      } catch (err) {
        if (err instanceof RefValidationError) throw new Error(err.message);
        throw err;
      }
      const registry = options.registry ?? DEFAULT_REGISTRY;
      assertRegistryTrust(registry, options.registryTrust ?? false);
      const result = await fetchRelease({ registry, ref: validatedRef.ref });
      extractDir = result.extractDir;
      manifest = result.manifest;
      repoRoot = extractDir;
      verifiedAt = result.verifiedAt;
      ref = validatedRef.ref;
    } else {
      throw new Error(
        "No manifest path and no --ref provided. " +
          "Either pass --manifest <path> or --ref <tag|sha>.",
      );
    }

    // ── Resolve IDs ───────────────────────────────────────────────────────────
    const resolvedIds = resolveIds(options.ids, manifest);

    // Validate that all resolved IDs are real component IDs.
    // resolveIds passes through unknown literal IDs unchanged (for the caller to validate).
    const allComponentIds = new Set(manifest.components.map((c) => c.id));
    const unknownIds = resolvedIds.filter((id) => !allComponentIds.has(id));
    if (unknownIds.length > 0 || resolvedIds.length === 0) {
      const problematic = unknownIds.length > 0 ? unknownIds : options.ids;
      const quoted = problematic.map((id) => `"${id}"`).join(", ");
      throw new Error(
        `No components matched ${quoted}. ` +
          `Run \`ai-skills list --manifest <path>\` to see available components.`,
      );
    }

    // ── Filter already-installed ───────────────────────────────────────────────
    if (!options.force) {
      const existingLock = readLockfile(installRoot);
      const installedKeys = new Set(
        (existingLock?.entries ?? []).map((e) => `${e.id}:${e.target}`),
      );

      // Determine which targets would be selected (approximate — uses manifest targets).
      // This is a hint only; the actual target filter happens inside runInit.
      const requestedTargets = options.targets ?? manifest.targets.map((t) => t.id);

      const alreadyInstalled: string[] = [];
      const toInstall: string[] = [];
      for (const id of resolvedIds) {
        const needsInstall = requestedTargets.some((t) => !installedKeys.has(`${id}:${t}`));
        if (needsInstall) {
          toInstall.push(id);
        } else {
          alreadyInstalled.push(id);
        }
      }

      if (alreadyInstalled.length > 0) {
        process.stdout.write(
          `Already installed (skipping): ${alreadyInstalled.join(", ")}. Use --force to reinstall.\n`,
        );
      }

      if (toInstall.length === 0) {
        process.stdout.write("Nothing to add.\n");
        return;
      }

      // Call runInit with only the components that need installing.
      await runInit({
        ...(options.manifestPath ? { manifestPath: resolve(options.manifestPath) } : {}),
        ...(options.ref ? { ref: options.ref } : {}),
        ...(options.registry ? { registry: options.registry } : {}),
        ...(options.registryTrust !== undefined ? { registryTrust: options.registryTrust } : {}),
        ...(options.noVerify !== undefined ? { noVerify: options.noVerify } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
        ...(options.userMode !== undefined ? { userMode: options.userMode } : {}),
        ...(options.targets ? { targets: options.targets } : {}),
        ...(options.onExistingFile ? { onExistingFile: options.onExistingFile } : {}),
        ...(options.onDenyRule ? { onDenyRule: options.onDenyRule } : {}),
        ...(options.onConflict ? { onConflict: options.onConflict } : {}),
        installRoot,
        components: toInstall,
        preserveExistingEntries: true,
      });
    } else {
      // --force: reinstall all matched components
      await runInit({
        ...(options.manifestPath ? { manifestPath: resolve(options.manifestPath) } : {}),
        ...(options.ref ? { ref: options.ref } : {}),
        ...(options.registry ? { registry: options.registry } : {}),
        ...(options.registryTrust !== undefined ? { registryTrust: options.registryTrust } : {}),
        ...(options.noVerify !== undefined ? { noVerify: options.noVerify } : {}),
        ...(options.yes !== undefined ? { yes: options.yes } : {}),
        ...(options.userMode !== undefined ? { userMode: options.userMode } : {}),
        ...(options.targets ? { targets: options.targets } : {}),
        ...(options.onExistingFile ? { onExistingFile: options.onExistingFile } : {}),
        ...(options.onDenyRule ? { onDenyRule: options.onDenyRule } : {}),
        ...(options.onConflict ? { onConflict: options.onConflict } : {}),
        installRoot,
        components: resolvedIds,
        preserveExistingEntries: true,
      });
    }
  } finally {
    if (extractDir) {
      await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

// ─── ID resolution ────────────────────────────────────────────────────────────

/**
 * Expand a list of ids/globs/bundle-ids to concrete component ids.
 *
 * Resolution order for each argument:
 *   1. Exact bundle id match → expand to all component ids in that bundle.
 *   2. Contains glob chars (`*` or `?`) → match all component ids.
 *   3. Otherwise → exact component id (must exist; caller validates after).
 *
 * Duplicates are deduplicated (preserving first occurrence order).
 */
export function resolveIds(args: string[], manifest: Manifest): string[] {
  const allComponentIds = new Set(manifest.components.map((c) => c.id));
  const bundleById = new Map(manifest.bundles.map((b) => [b.id, b]));
  const resolved: string[] = [];
  const seen = new Set<string>();

  function push(id: string): void {
    if (!seen.has(id)) {
      seen.add(id);
      resolved.push(id);
    }
  }

  for (const arg of args) {
    // 1. Bundle match
    const bundle = bundleById.get(arg);
    if (bundle) {
      for (const cid of bundle.components) {
        if (allComponentIds.has(cid)) push(cid);
      }
      continue;
    }

    // 2. Glob
    if (arg.includes("*") || arg.includes("?")) {
      const re = globToRegex(arg);
      let matched = false;
      for (const id of allComponentIds) {
        if (re.test(id)) {
          push(id);
          matched = true;
        }
      }
      if (!matched) {
        // No match — pass through as-is so the caller can error on it.
        push(arg);
      }
      continue;
    }

    // 3. Exact id
    push(arg);
  }

  return resolved;
}

/**
 * Convert a simple glob pattern to a RegExp.
 *
 * Supported: `*` (matches any chars including `.`), `?` (matches any single char).
 * All other regex metacharacters are escaped.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[\\^$.|+()[\]{}]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
