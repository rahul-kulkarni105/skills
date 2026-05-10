import { cp, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { canonicalSha256 } from "./sha.js";
import { type LockfileEntry } from "./lockfile.js";
import { renderShim } from "./shim.js";
import { type ShimTemplate } from "./manifest-schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One file to be installed. Collected by the `init` command and handed to
 * `runInstall` as a batch.
 */
export interface FileInstallSpec {
  /** Component id from the manifest. */
  componentId: string;
  /** Target id (e.g. "claude"). */
  target: string;
  /** Repo-relative source path (recorded in the lockfile). */
  repoRelativeSource: string;
  /** Absolute path to the source file on disk. */
  sourceAbsPath: string;
  /** Install-root-relative destination path. Forward slashes. */
  dest: string;
  /** sha256 from the manifest — recorded in the lockfile on overwrite installs (copy entries). */
  manifestSha256: string;
  /**
   * When true the file already exists on disk and the user chose to adopt it.
   * No copy is performed; the current on-disk sha is recorded in the lockfile.
   */
  adopted?: boolean;
  /**
   * When present, render an inline-content shim instead of copying the canonical file.
   * `sha256` in the resulting lockfile entry is the sha of the *rendered* output.
   */
  shimTemplate?: ShimTemplate;
  /**
   * When present, write this pre-merged content instead of copying the source file.
   * Used for `mergeStrategy: "deep-merge"` components (settings files).
   *
   * The lockfile entry for a settings-merge:
   *   - `kind: "settings-merge"`
   *   - `sha256`: `upstreamProjectionSha` (not the sha of the merged file)
   *   - `userKeys`: JSON-pointer list of user-controlled paths
   */
  settingsMerge?: {
    /** Already-merged JSON content to write to disk. */
    mergedContent: string;
    /** sha256 of the stable-serialised upstream projection. Stored in lockfile. */
    upstreamProjectionSha: string;
    /** JSON-pointer list of user-controlled paths. Stored in lockfile. */
    userKeys: string[];
  };
}

// ─── Preflight ────────────────────────────────────────────────────────────────

/**
 * Validate the install set before any I/O.
 *
 * Checks:
 *   1. No dest resolves outside the install root (path traversal).
 *   2. No two non-adopted dests differ only in case (macOS/Windows trap).
 *
 * Symlink checks are deferred to the copy phase so we have the real path.
 *
 * Throws `Error` on the first violation found.
 */
export function preflight(installRoot: string, files: ReadonlyArray<FileInstallSpec>): void {
  const resolvedRoot = resolve(installRoot);
  const lowerToOriginal = new Map<string, string>();

  for (const f of files) {
    // 1. Path traversal
    const abs = resolve(join(resolvedRoot, f.dest));
    const rootWithSep = resolvedRoot.endsWith(sep)
      ? resolvedRoot
      : resolvedRoot + sep;
    if (abs !== resolvedRoot && !abs.startsWith(rootWithSep)) {
      throw new Error(
        `Path traversal detected: dest "${f.dest}" resolves outside the install root.`,
      );
    }

    // 2. Case-collision (only for files that will actually be written)
    if (!f.adopted) {
      const lower = f.dest.toLowerCase();
      const existing = lowerToOriginal.get(lower);
      if (existing !== undefined && existing !== f.dest) {
        throw new Error(
          `Case-collision in install set: "${f.dest}" and "${existing}" differ only in case.`,
        );
      }
      lowerToOriginal.set(lower, f.dest);
    }
  }
}

// ─── Installer ────────────────────────────────────────────────────────────────

/**
 * Install a set of files into `installRoot` via an atomic staging directory.
 *
 * Algorithm:
 *   1. Run preflight checks (fast, no I/O).
 *   2. Create staging dir: `<installRoot>/.ai-skills.staging/<pid>-<ts>/`.
 *   3. For each non-adopted file:
 *        a. Symlink-check the real dest path (lstat).
 *        b. Copy source → staging dest (parent dirs created as needed).
 *   4. Promote: rename each staged file to its real dest location.
 *        Parent dirs in the install root are created before each rename.
 *   5. `finally`: rm -rf staging dir (empty on success; contains leftovers on failure).
 *
 * The lockfile is NOT written here — that is the caller's responsibility,
 * and it must happen after this function returns successfully.
 *
 * Returns the `LockfileEntry[]` that the caller should persist.
 * Throws on any error; the staging dir is always cleaned up.
 */
export async function runInstall(
  installRoot: string,
  files: ReadonlyArray<FileInstallSpec>,
): Promise<LockfileEntry[]> {
  preflight(installRoot, files);

  const stagingDir = join(
    installRoot,
    ".ai-skills.staging",
    `${process.pid}-${Date.now()}`,
  );

  // Entries are built in two passes (adopted then written) to preserve order.
  const entries: LockfileEntry[] = [];
  const toPromote: Array<{ staged: string; real: string }> = [];

  try {
    // ── Phase 1: handle adopted files (no I/O, just sha recompute) ──────────
    for (const f of files) {
      if (!f.adopted) continue;
      const absPath = join(installRoot, f.dest);
      const buf = await readFile(absPath);
      const sha = canonicalSha256(buf);
      entries.push({
        id: f.componentId,
        target: f.target,
        source: f.repoRelativeSource,
        dest: f.dest,
        sha256: sha,
        adopted: true,
      });
    }

    // ── Phase 2: stage non-adopted files ────────────────────────────────────
    for (const f of files) {
      if (f.adopted) continue;

      const destAbs = join(installRoot, f.dest);

      // Symlink check on existing dest — refuse to follow or overwrite a symlink.
      if (existsSync(destAbs)) {
        const st = await lstat(destAbs);
        if (st.isSymbolicLink()) {
          throw new Error(
            `Refusing to overwrite symlink at "${f.dest}". ` +
              `Remove the symlink manually and re-run \`ai-skills init\`.`,
          );
        }
      }

      const stagedPath = join(stagingDir, f.dest);
      await mkdir(dirname(stagedPath), { recursive: true });

      let installSha: string;
      const extraShimFields: Partial<LockfileEntry> = {};

      if (f.settingsMerge) {
        // Settings-merge: write pre-merged content, record upstream projection sha.
        await writeFile(stagedPath, f.settingsMerge.mergedContent, "utf8");
        installSha = f.settingsMerge.upstreamProjectionSha;
        extraShimFields.kind = "settings-merge";
        extraShimFields.userKeys = f.settingsMerge.userKeys;
      } else if (f.shimTemplate) {
        // Inline-shim: render header + canonical content, write rendered bytes.
        const canonicalBuf = await readFile(f.sourceAbsPath);
        const rendered = renderShim(f.shimTemplate, canonicalBuf, f.repoRelativeSource);
        await writeFile(stagedPath, rendered, "utf8");
        installSha = canonicalSha256(rendered);
        extraShimFields.shimTemplateId = f.shimTemplate.id;
        extraShimFields.shimTemplateSha = f.shimTemplate.sha256;
        extraShimFields.shimCanonicalSha = canonicalSha256(canonicalBuf);
      } else {
        await cp(f.sourceAbsPath, stagedPath);
        installSha = f.manifestSha256;
      }

      toPromote.push({ staged: stagedPath, real: destAbs });

      entries.push({
        id: f.componentId,
        target: f.target,
        source: f.repoRelativeSource,
        dest: f.dest,
        sha256: installSha,
        ...extraShimFields,
      });
    }

    // ── Phase 3: promote staged files to real locations ──────────────────────
    for (const { staged, real } of toPromote) {
      await mkdir(dirname(real), { recursive: true });
      await rename(staged, real);
    }

    return entries;
  } finally {
    // Always clean up staging dir — empty on success, populated on failure.
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
