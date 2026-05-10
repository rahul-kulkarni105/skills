import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadManifest } from "../manifest.js";
import {
  buildLockfile,
  LOCKFILE_NAME,
  type Lockfile,
  type LockfileEntry,
  readLockfile,
  writeLockfile,
} from "../lockfile.js";
import { type FileInstallSpec, runInstall } from "../installer.js";
import {
  type ExistingFileChoice,
  promptAdoptOrOverwrite,
  promptComponentSelect,
  promptPickMode,
  promptTargetSelect,
} from "../prompts.js";
import { type Manifest, type ShimTemplate } from "../manifest-schema.js";
import {
  assertRegistryTrust,
  DEFAULT_REGISTRY,
  fetchRelease,
} from "../fetch.js";
import { validateRef, RefValidationError } from "../ref-validator.js";
import { getTargetDef } from "../targets.js";
import { canonicalSha256 } from "../sha.js";
import { shimNeedsRerender } from "../shim.js";
import {
  mergeSettings,
  buildDenyPrompt,
  buildConflictPrompt,
  type JsonObject,
} from "../settings-merge.js";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface InitOptions {
  /**
   * Absolute path to a local manifest.json file.
   * When absent, `ref` must be provided and the manifest is fetched from GitHub.
   */
  manifestPath?: string;
  /** Absolute path to the directory where files will be installed. */
  installRoot: string;
  /**
   * Git ref to fetch from GitHub (semver tag or 40-char commit sha).
   * Required when `manifestPath` is absent. Ignored when `manifestPath` is set.
   */
  ref?: string;
  /**
   * GitHub registry in `owner/repo` format.
   * Defaults to the value of `DEFAULT_REGISTRY`.
   */
  registry?: string;
  /**
   * Must be true when `registry` is not the default — acknowledges the
   * caller trusts the non-default registry (`--registry-trust` flag).
   */
  registryTrust?: boolean;
  /**
   * Skip cosign signature verification (warn-only, recorded as
   * `verifiedAt: null` in the lockfile). Refused when `yes` is true.
   */
  noVerify?: boolean;
  /**
   * Non-interactive mode: overwrite all existing files, accept all defaults.
   * When true and `onExistingFile` is not provided, existing files are
   * overwritten without prompting. Refuses `noVerify`.
   */
  yes?: boolean;
  /**
   * When true, install into the user's home directory. Targets that are
   * project-scoped only (Cursor, Copilot) are silently skipped with a warning.
   */
  userMode?: boolean;
  /**
   * Pre-selected target ids. When provided the target picker is skipped.
   */
  targets?: string[];
  /**
   * Pre-selected component ids. When provided the component/bundle picker is
   * skipped. Useful for programmatic and test invocations.
   */
  components?: string[];
  /**
   * Callback invoked when a dest file already exists on disk.
   * Injected in tests to avoid spawning an interactive prompt.
   * When provided it takes precedence over `yes` for existing-file decisions.
   */
  onExistingFile?: (dest: string) => Promise<ExistingFileChoice>;
  /**
   * Callback invoked for each new `permissions.deny` rule the upstream settings
   * file wants to add. Return true to accept. When absent, defaults to auto-accept
   * in `--yes` mode, or an interactive prompt otherwise.
   */
  onDenyRule?: (rule: string) => Promise<boolean>;
  /**
   * Callback invoked for scalar JSON conflicts during settings merge.
   * Return "upstream" or "user". When absent, defaults to "upstream" in `--yes`
   * mode, or an interactive prompt otherwise.
   */
  onConflict?: (jsonPointer: string, upstreamValue: unknown, userValue: unknown) => Promise<"upstream" | "user">;
  /**
   * When true, entries from the existing lockfile that are NOT part of this
   * install run are preserved and merged into the new lockfile.
   * Used by the `add` command to augment an existing installation without
   * clobbering previously-installed entries.
   */
  preserveExistingEntries?: boolean;
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Run the `init` command end-to-end:
 *   1. Resolve source: local manifest path OR network fetch from GitHub.
 *   2. Load + validate manifest.
 *   3. Determine target(s).
 *   4. Determine components.
 *   5. For each (target, component) pair: adopt / overwrite / skip existing files.
 *   6. Stage → promote via `runInstall`.
 *   7. Write lockfile atomically (LAST).
 */
export async function runInit(options: InitOptions): Promise<void> {
  // ── Guard: --no-verify + --yes is refused ─────────────────────────────────
  if (options.noVerify && options.yes) {
    throw new Error(
      "--no-verify cannot be combined with --yes. " +
        "Non-interactive mode requires verified installs.",
    );
  }

  const installRoot = resolve(options.installRoot);
  let extractDir: string | null = null;
  let manifest: Manifest;
  let repoRoot: string;
  let verifiedAt: string | null = null;

  try {
    // ── 1. Resolve source ────────────────────────────────────────────────────
    if (options.manifestPath) {
      // Local path (Session 2 mode, tests, --manifest flag).
      const resolvedManifestPath = resolve(options.manifestPath);
      repoRoot = dirname(resolvedManifestPath);
      manifest = await loadManifest(resolvedManifestPath);
    } else {
      // Network path (Session 3 default).
      if (!options.ref) {
        throw new Error(
          "No manifest path and no --ref provided. " +
            "Either pass --manifest <path> or --ref <tag|sha> to fetch from GitHub.",
        );
      }

      // Validate ref before any network I/O.
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

      const result = await fetchRelease({
        registry,
        ref: validatedRef.ref,
        ...(options.registryTrust !== undefined ? { registryTrust: options.registryTrust } : {}),
        ...(options.noVerify !== undefined ? { noVerify: options.noVerify } : {}),
      });

      extractDir = result.extractDir;
      manifest = result.manifest;
      repoRoot = extractDir;
      verifiedAt = result.verifiedAt;
    }

    // ── 2. Resolve target(s) ────────────────────────────────────────────────
    // Build the candidate target list from the manifest, applying --user mode filter.
    let candidateTargets = manifest.targets;
    if (options.userMode) {
      const disabled: string[] = [];
      candidateTargets = manifest.targets.filter((t) => {
        const def = getTargetDef(t.id);
        if (def?.disabledInUserMode) {
          disabled.push(t.label);
          return false;
        }
        return true;
      });
      if (disabled.length > 0) {
        process.stderr.write(
          `Warning: --user mode: skipping project-scoped target(s): ${disabled.join(", ")}.\n`,
        );
      }
    }

    let selectedTargetIds: string[];
    if (options.targets && options.targets.length > 0) {
      selectedTargetIds = options.targets;
    } else if (options.yes) {
      selectedTargetIds = candidateTargets.map((t) => t.id);
    } else {
      selectedTargetIds = await promptTargetSelect(candidateTargets);
    }

    const targetIdSet = new Set(manifest.targets.map((t) => t.id));
    for (const tid of selectedTargetIds) {
      if (!targetIdSet.has(tid)) {
        throw new Error(`Unknown target "${tid}". Valid targets: ${[...targetIdSet].join(", ")}.`);
      }
    }

    // In --user mode, reject any explicitly-passed target that is project-scoped.
    if (options.userMode) {
      for (const tid of selectedTargetIds) {
        const def = getTargetDef(tid);
        if (def?.disabledInUserMode) {
          throw new Error(
            `Target "${tid}" is project-scoped and cannot be used with --user mode.`,
          );
        }
      }
    }

    // ── 3. Resolve component(s) ──────────────────────────────────────────────
    // Filter to components that have an install spec for at least one selected
    // target and whose type is supported by that target.
    const installableComponents = manifest.components.filter((c) =>
      selectedTargetIds.some((tid) => {
        if (!(tid in c.installs)) return false;
        const def = getTargetDef(tid);
        return !def || def.supportedTypes.has(c.type);
      }),
    );

    let selectedComponentIds: string[];
    if (options.components !== undefined) {
      selectedComponentIds = options.components;
    } else if (options.yes) {
      selectedComponentIds = installableComponents.map((c) => c.id);
    } else {
      const mode = await promptPickMode();
      if (mode === "bundle") {
        selectedComponentIds = await selectViaBundle(manifest, installableComponents);
      } else {
        selectedComponentIds = await promptComponentSelect(installableComponents);
      }
    }

    const selectedComponentIdSet = new Set(selectedComponentIds);

    // ── 4. Build FileInstallSpec list ────────────────────────────────────────
    // Read existing lockfile so we can detect shim re-render triggers.
    let existingLockfile: Lockfile | null = null;
    try {
      existingLockfile = readLockfile(installRoot);
    } catch {
      // Corrupt lockfile: ignore for purposes of re-render detection.
      // The init command will write a fresh lockfile at the end.
    }

    // Index existing lockfile entries for fast lookup.
    const lockedByKey = new Map<string, LockfileEntry>();
    for (const e of existingLockfile?.entries ?? []) {
      lockedByKey.set(`${e.id}:${e.target}`, e);
    }

    // Build a shimTemplate lookup from the manifest.
    const shimTemplateById = new Map<string, ShimTemplate>(
      manifest.shimTemplates.map((t) => [t.id, t]),
    );

    const specs: FileInstallSpec[] = [];

    for (const targetId of selectedTargetIds) {
      for (const component of installableComponents) {
        if (!selectedComponentIdSet.has(component.id)) continue;

        const installSpec = component.installs[targetId];
        if (!installSpec) continue;

        // Resolve shim template (if any).
        const shimTemplate = installSpec.shim
          ? shimTemplateById.get(installSpec.shim)
          : undefined;

        const destAbs = join(installRoot, installSpec.dest);
        let adopted = false;

        // ── Re-render detection for shim entries ──────────────────────────
        if (shimTemplate) {
          const locked = lockedByKey.get(`${component.id}:${targetId}`);
          if (locked?.shimTemplateId) {
            const needsRerender = shimNeedsRerender({
              lockedCanonicalSha: locked.shimCanonicalSha ?? "",
              lockedTemplateSha: locked.shimTemplateSha ?? "",
              lockedDest: locked.dest,
              currentCanonicalSha: component.sha256,
              currentTemplateSha: shimTemplate.sha256,
              currentDest: installSpec.dest,
            });

            if (!needsRerender) {
              // Check for user-edited drift in the rendered shim.
              if (existsSync(destAbs)) {
                const diskBuf = await readFile(destAbs);
                const diskSha = canonicalSha256(diskBuf);
                if (diskSha === locked.sha256) {
                  // No changes anywhere — skip.
                  continue;
                }
                // User edited the rendered shim → treat as conflict.
                let choice: ExistingFileChoice;
                if (options.onExistingFile) {
                  choice = await options.onExistingFile(installSpec.dest);
                } else if (options.yes) {
                  choice = "overwrite";
                } else {
                  choice = await promptAdoptOrOverwrite(installSpec.dest);
                }
                if (choice === "skip") continue;
                adopted = choice === "adopt";
              }
            }
            // triple changed → fall through to re-render (no prompt)
          } else if (existsSync(destAbs)) {
            // Shim exists on disk but no locked shim metadata → treat as new.
            let choice: ExistingFileChoice;
            if (options.onExistingFile) {
              choice = await options.onExistingFile(installSpec.dest);
            } else if (options.yes) {
              choice = "overwrite";
            } else {
              choice = await promptAdoptOrOverwrite(installSpec.dest);
            }
            if (choice === "skip") continue;
            adopted = choice === "adopt";
          }
        } else if (component.mergeStrategy === "deep-merge") {
          // ── Settings-merge path ──────────────────────────────────────────
          // Read upstream and existing, merge, record upstream projection sha.
          const upstreamBuf = await readFile(join(repoRoot, component.source));
          let upstreamJson: JsonObject;
          try {
            upstreamJson = JSON.parse(upstreamBuf.toString("utf8")) as JsonObject;
          } catch {
            throw new Error(
              `Upstream settings file "${component.source}" is not valid JSON.`,
            );
          }

          let existingJson: JsonObject | null = null;
          if (existsSync(destAbs)) {
            try {
              const existingBuf = await readFile(destAbs);
              existingJson = JSON.parse(existingBuf.toString("utf8")) as JsonObject;
            } catch {
              throw new Error(
                `Existing settings file at "${installSpec.dest}" is not valid JSON. ` +
                  `Fix or remove it before running ai-skills init.`,
              );
            }
          }

          // Build prompt callbacks.
          const onDeny = options.onDenyRule
            ? options.onDenyRule
            : options.yes
              ? async () => true
              : await buildDenyPrompt();

          const onConflict = options.onConflict
            ? (ptr: string, up: unknown, usr: unknown) =>
                options.onConflict!(ptr, up, usr)
            : options.yes
              ? async () => "upstream" as const
              : await buildConflictPrompt();

          const mergeResult = await mergeSettings(
            upstreamJson,
            existingJson,
            onDeny,
            onConflict,
          );

          const mergedContent = JSON.stringify(mergeResult.merged, null, 2) + "\n";

          specs.push({
            componentId: component.id,
            target: targetId,
            repoRelativeSource: component.source,
            sourceAbsPath: join(repoRoot, component.source),
            dest: installSpec.dest,
            manifestSha256: component.sha256,
            adopted: false,
            settingsMerge: {
              mergedContent,
              upstreamProjectionSha: mergeResult.upstreamProjectionSha,
              userKeys: mergeResult.userKeys,
            },
          });
          continue; // skip the generic specs.push() at the bottom of the loop
        } else {
          // Copy entry: existing file prompts adopt/overwrite as before.
          if (existsSync(destAbs)) {
            let choice: ExistingFileChoice;
            if (options.onExistingFile) {
              choice = await options.onExistingFile(installSpec.dest);
            } else if (options.yes) {
              choice = "overwrite";
            } else {
              choice = await promptAdoptOrOverwrite(installSpec.dest);
            }
            if (choice === "skip") continue;
            adopted = choice === "adopt";
          }
        }

        specs.push({
          componentId: component.id,
          target: targetId,
          repoRelativeSource: component.source,
          sourceAbsPath: join(repoRoot, component.source),
          dest: installSpec.dest,
          manifestSha256: component.sha256,
          adopted,
          ...(shimTemplate && !adopted ? { shimTemplate } : {}),
        });
      }
    }

    if (specs.length === 0) {
      process.stdout.write("Nothing to install.\n");
      return;
    }

    // ── 5. Stage → promote ───────────────────────────────────────────────────
    const newEntries = await runInstall(installRoot, specs);

    // ── 5a. Merge with preserved entries (used by `add`) ─────────────────────
    let entries: LockfileEntry[] = newEntries;
    if (options.preserveExistingEntries && existingLockfile) {
      const newKeys = new Set(newEntries.map((e) => `${e.id}:${e.target}`));
      const preserved = existingLockfile.entries.filter((e) => !newKeys.has(`${e.id}:${e.target}`));
      entries = [...preserved, ...newEntries];
    }

    // ── 6. Write lockfile (last, atomically) ─────────────────────────────────
    const lockfile = buildLockfile(entries, manifest.manifestVersion, manifest.release.tag);
    // Attach verification timestamp if present.
    if (verifiedAt !== null) {
      (lockfile as Lockfile & { verifiedAt?: string }).verifiedAt = verifiedAt;
    }
    await writeLockfile(installRoot, lockfile);

    const writtenCount = entries.filter((e) => !e.adopted).length;
    const adoptedCount = entries.filter((e) => e.adopted).length;
    const parts: string[] = [];
    if (writtenCount > 0) parts.push(`wrote ${writtenCount} file(s)`);
    if (adoptedCount > 0) parts.push(`adopted ${adoptedCount} file(s)`);
    process.stdout.write(`\nDone — ${parts.join(", ")}. Lockfile: ${LOCKFILE_NAME}\n`);
  } finally {
    // Always clean up the network-fetch extract dir.
    if (extractDir) {
      await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function selectViaBundle(
  manifest: Manifest,
  installableComponents: Manifest["components"],
): Promise<string[]> {
  const { select } = await import("@inquirer/prompts");
  const installableIds = new Set(installableComponents.map((c) => c.id));
  const applicableBundles = manifest.bundles.filter((b) =>
    b.components.some((cid) => installableIds.has(cid)),
  );

  if (applicableBundles.length === 0) {
    // Fall back to individual picker if no bundles match the selected targets.
    return promptComponentSelect(installableComponents);
  }

  const bundleId = await select<string>({
    message: "Select a bundle to install:",
    choices: applicableBundles.map((b) => ({
      name: `${b.label}  — ${b.description}`,
      value: b.id,
    })),
  });

  const bundle = applicableBundles.find((b) => b.id === bundleId);
  if (!bundle) throw new Error(`Bundle "${bundleId}" not found.`);
  return bundle.components.filter((cid) => installableIds.has(cid));
}
