import { existsSync, readFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { LOCKFILE_SCHEMA_VERSION } from "./manifest-schema.js";
import { CLI_VERSION } from "./version.js";

export { LOCKFILE_SCHEMA_VERSION };
export const LOCKFILE_NAME = ".ai-skills.lock.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LockfileEntry {
  /** Component id from the manifest. */
  id: string;
  /** Target id this entry was installed for. */
  target: string;
  /** Repo-relative source path (for traceability). */
  source: string;
  /** Install-root-relative destination path. */
  dest: string;
  /**
   * Entry kind:
   *   - "file" (default, omitted for back-compat): copied or shim-rendered file.
   *   - "settings-merge": upstream settings merged into an existing user file.
   */
  kind?: "file" | "settings-merge";
  /**
   * sha256 of what was written to disk:
   *   - For file/shim entries: canonicalSha256 of the written bytes.
   *   - For settings-merge entries: canonicalSha256 of the stable-serialised
   *     *upstream projection only*. `verify` re-projects and compares.
   */
  sha256: string;
  /**
   * Present (and true) when the user chose to adopt a pre-existing file
   * rather than overwrite it. The sha256 reflects the file as found on disk.
   */
  adopted?: true;
  // ── Shim metadata (only present on inline-shim entries) ─────────────────
  /** The shim template id used at render time (from manifest.shimTemplates). */
  shimTemplateId?: string;
  /** The shim template sha256 at render time — bump triggers re-render. */
  shimTemplateSha?: string;
  /** sha256 of the canonical source file at render time — change triggers re-render. */
  shimCanonicalSha?: string;
  // ── Settings-merge metadata (only present on settings-merge entries) ─────
  /**
   * JSON-pointer list of paths whose values are user-controlled (were already
   * present and conflict-resolved in the user's favour, or are entirely
   * user-invented). Used by `verify` to re-project the upstream contribution.
   */
  userKeys?: string[];
}

export interface Lockfile {
  schemaVersion: number;
  manifestVersion: number;
  cliVersion: string;
  /** Git tag or 40-char commit sha from the manifest release block. */
  ref: string;
  /** ISO 8601 UTC timestamp of this installation. */
  installedAt: string;
  entries: LockfileEntry[];
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when the lockfile is present but cannot be trusted.
 * The `exitCode` field is always 2 (matches the verify/init exit-code contract).
 */
export class LockfileError extends Error {
  readonly exitCode: 2 = 2;
  constructor(message: string) {
    super(message);
    this.name = "LockfileError";
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Read and parse the lockfile from `installRoot/.ai-skills.lock.json`.
 *
 * Returns `null` if the file does not exist (not-yet-initialised project).
 * Throws `LockfileError` if the file exists but:
 *   - cannot be read
 *   - is not strict JSON
 *   - has an unexpected shape
 *   - was written by a newer schema version
 *
 * Reads synchronously — the lockfile is tiny and is always the first I/O
 * operation of a command.
 */
export function readLockfile(installRoot: string): Lockfile | null {
  const lockPath = join(installRoot, LOCKFILE_NAME);

  if (!existsSync(lockPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(lockPath, "utf8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LockfileError(`Cannot read lockfile at ${lockPath}: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LockfileError(
      `Lockfile at ${lockPath} is not valid JSON (possibly corrupt). ` +
        `Remove it and re-run \`ai-skills init\`.`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new LockfileError(
      `Lockfile at ${lockPath} has an unexpected top-level shape (must be an object).`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj["schemaVersion"] !== "number") {
    throw new LockfileError(`Lockfile at ${lockPath} is missing required field "schemaVersion".`);
  }

  if (obj["schemaVersion"] > LOCKFILE_SCHEMA_VERSION) {
    throw new LockfileError(
      `Lockfile at ${lockPath} was written by a newer version of ai-skills ` +
        `(schema ${obj["schemaVersion"]}, this CLI supports ${LOCKFILE_SCHEMA_VERSION}). ` +
        `Upgrade the CLI.`,
    );
  }

  // Trust the rest of the shape — strict validation of every field would
  // duplicate the manifest validator pattern for little gain in v1.
  return parsed as Lockfile;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Write `lockfile` to `installRoot/.ai-skills.lock.json` atomically.
 *
 * Strategy: write to a random `.tmp` file in the same directory, then
 * rename. Rename within the same directory is atomic on POSIX and atomic on
 * Windows (NTFS) with the `rename` syscall. The tmp file uses `flag: "wx"`
 * so two concurrent writes can't clobber each other silently.
 */
export async function writeLockfile(installRoot: string, lockfile: Lockfile): Promise<void> {
  const lockPath = join(installRoot, LOCKFILE_NAME);
  const tmpPath = join(
    installRoot,
    `.ai-skills.lock.json.${randomBytes(6).toString("hex")}.tmp`,
  );

  const content = JSON.stringify(lockfile, null, 2) + "\n";

  try {
    await writeFile(tmpPath, content, { encoding: "utf8", flag: "wx" });
    await rename(tmpPath, lockPath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/** Construct a fresh Lockfile object from the pieces collected during install. */
export function buildLockfile(
  entries: LockfileEntry[],
  manifestVersion: number,
  ref: string,
): Lockfile {
  return {
    schemaVersion: LOCKFILE_SCHEMA_VERSION,
    manifestVersion,
    cliVersion: CLI_VERSION,
    ref,
    installedAt: new Date().toISOString(),
    entries,
  };
}
