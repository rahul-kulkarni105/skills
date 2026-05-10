import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalSha256 } from "../sha.js";
import { LockfileError, readLockfile } from "../lockfile.js";
import { reprojectUpstream, type JsonObject } from "../settings-merge.js";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface VerifyOptions {
  /** Absolute path to the directory where files were installed. */
  installRoot: string;
}

// ─── Result ───────────────────────────────────────────────────────────────────

/** Per-file verification result (used by tests and future --json output). */
export type FileStatus = "ok" | "modified" | "missing";

export interface VerifyResult {
  /** Aggregate exit code: 0 = ok, 1 = drift detected, 2 = cannot verify. */
  exitCode: 0 | 1 | 2;
  files: Array<{ dest: string; status: FileStatus }>;
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Verify installed files against the lockfile.
 *
 * For every entry in the lockfile:
 *   - Recompute the canonical sha256 of the file at `installRoot/<entry.dest>`.
 *   - Compare to `entry.sha256`.
 *   - Emit a status line to stdout.
 *
 * Exit codes:
 *   0 — all files match their lockfile sha256.
 *   1 — one or more files are missing or have drifted.
 *   2 — lockfile is absent or corrupt (cannot verify).
 *
 * Adopted entries are verified the same way as written entries — the user
 * may have drifted them after adopting.
 */
export async function runVerify(options: VerifyOptions): Promise<VerifyResult> {
  const installRoot = resolve(options.installRoot);

  // ── Load lockfile ──────────────────────────────────────────────────────────
  let lockfile;
  try {
    lockfile = readLockfile(installRoot);
  } catch (err) {
    if (err instanceof LockfileError) {
      process.stderr.write(`ai-skills verify: ${err.message}\n`);
      return { exitCode: 2, files: [] };
    }
    throw err;
  }

  if (lockfile === null) {
    process.stderr.write(
      `ai-skills verify: no lockfile found at ${installRoot}. ` +
        `Run \`ai-skills init\` first.\n`,
    );
    return { exitCode: 2, files: [] };
  }

  // ── Re-hash each entry ─────────────────────────────────────────────────────
  let anyDrift = false;
  const files: VerifyResult["files"] = [];

  for (const entry of lockfile.entries) {
    const filePath = join(installRoot, entry.dest);
    let status: FileStatus;

    let buf: Buffer;
    try {
      buf = await readFile(filePath);
    } catch {
      status = "missing";
      anyDrift = true;
      process.stdout.write(`MISSING  ${entry.dest}\n`);
      files.push({ dest: entry.dest, status });
      continue;
    }

    if (entry.kind === "settings-merge") {
      // Re-project the upstream contribution from the live merged file.
      // Only flag drift on upstream-contributed keys; user-only changes are ignored.
      let liveJson: JsonObject;
      try {
        liveJson = JSON.parse(buf.toString("utf8")) as JsonObject;
      } catch {
        status = "modified";
        anyDrift = true;
        process.stdout.write(`MODIFIED ${entry.dest} (not valid JSON)\n`);
        files.push({ dest: entry.dest, status });
        continue;
      }
      const liveSha = reprojectUpstream(liveJson, entry.userKeys ?? []);
      if (liveSha !== entry.sha256) {
        status = "modified";
        anyDrift = true;
        process.stdout.write(`MODIFIED ${entry.dest} (upstream contribution changed)\n`);
      } else {
        status = "ok";
        process.stdout.write(`OK       ${entry.dest}\n`);
      }
    } else {
      // File / shim entry: compare full sha of what's on disk.
      const sha = canonicalSha256(buf);
      if (sha !== entry.sha256) {
        status = "modified";
        anyDrift = true;
        process.stdout.write(`MODIFIED ${entry.dest}\n`);
      } else {
        status = "ok";
        process.stdout.write(`OK       ${entry.dest}\n`);
      }
    }
    files.push({ dest: entry.dest, status });
  }

  const exitCode: 0 | 1 = anyDrift ? 1 : 0;
  return { exitCode, files };
}
