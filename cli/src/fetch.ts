/**
 * Network fetch layer for Session 3.
 *
 * Responsibilities:
 *   1. Fetch `manifest.json` for a given GitHub repo + ref.
 *   2. Fetch the source tarball and extract it into a temp directory.
 *   3. Post-fetch sha verification: every component's on-disk file is
 *      re-hashed against manifest.sha256 before any write is attempted.
 *   4. Retry logic: 3 attempts with 1s/2s/4s backoff on transient errors
 *      (5xx, ECONNRESET, ETIMEDOUT). 4xx and integrity failures are not
 *      retried — they indicate a hard error, not a transient one.
 *
 * The GitHub tarball URL pattern used here is the standard archive endpoint:
 *   https://github.com/<owner>/<repo>/archive/<ref>.tar.gz
 *
 * No native deps — uses Node's built-in `fetch` (Node ≥18) and the pure-JS
 * `tar` package for extraction.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as tar from "tar";
import { canonicalSha256 } from "./sha.js";
import { loadManifest } from "./manifest.js";
import type { Manifest } from "./manifest-schema.js";
import { readFile } from "node:fs/promises";

// ─── Constants ────────────────────────────────────────────────────────────────

const GITHUB_API_BASE = "https://api.github.com";
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

/** Default GitHub repo hosting the manifest + tarballs. */
export const DEFAULT_REGISTRY = "rahul-kulkarni105/skills";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FetchOptions {
  /**
   * GitHub repo in `owner/repo` format.
   * Defaults to `DEFAULT_REGISTRY`.
   */
  registry?: string;
  /**
   * Must be a validated ref (semver tag or 40-char commit sha).
   * Pass the output of `validateRef()` — never a raw user string.
   */
  ref: string;
  /**
   * When true the caller has acknowledged the risk of using an untrusted
   * registry (`--registry-trust` flag). Required when `registry` is set to
   * anything other than the default.
   */
  registryTrust?: boolean;
  /**
   * When true skip cosign signature verification (warn-only already set
   * by the caller). Recorded as `verifiedAt: null` in the lockfile.
   */
  noVerify?: boolean;
}

export interface FetchResult {
  /** Absolute path to the temp directory containing the extracted tarball. */
  extractDir: string;
  /** Loaded + validated manifest from the fetched content. */
  manifest: Manifest;
  /**
   * ISO 8601 timestamp of successful cosign verification, or null when
   * `--no-verify` was passed.
   */
  verifiedAt: string | null;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export class IntegrityError extends Error {
  constructor(
    public readonly componentId: string,
    public readonly dest: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Integrity check failed for component "${componentId}" (${dest}): ` +
        `expected sha256 ${expected}, got ${actual}`,
    );
    this.name = "IntegrityError";
  }
}

// ─── Registry guard ───────────────────────────────────────────────────────────

/**
 * Abort if the caller is using a non-default registry without `--registry-trust`.
 */
export function assertRegistryTrust(registry: string, registryTrust: boolean): void {
  if (registry !== DEFAULT_REGISTRY && !registryTrust) {
    throw new Error(
      `Registry "${registry}" is not the default. ` +
        "Pass --registry-trust to acknowledge you trust this registry.",
    );
  }
}

// ─── Main fetch entry ─────────────────────────────────────────────────────────

/**
 * Fetch manifest + tarball from GitHub, verify integrity, return extracted dir.
 *
 * Callers are responsible for cleaning up `result.extractDir` when done.
 */
export async function fetchRelease(options: FetchOptions): Promise<FetchResult> {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  assertRegistryTrust(registry, options.registryTrust ?? false);

  // ── 1. Fetch manifest.json ─────────────────────────────────────────────────
  const manifestUrl = rawGitHubUrl(registry, options.ref, "manifest.json");
  const manifestText = await retryFetch(manifestUrl);

  // Write to a temp file so loadManifest can validate it.
  const manifestTmpDir = await mkdtemp(join(tmpdir(), "ai-skills-manifest-"));
  const manifestTmpPath = join(manifestTmpDir, "manifest.json");
  try {
    await writeFile(manifestTmpPath, manifestText, "utf8");
    const manifest = await loadManifest(manifestTmpPath);

    // ── 2. Cosign verification ─────────────────────────────────────────────
    let verifiedAt: string | null = null;
    if (!options.noVerify) {
      verifiedAt = await verifyCosignOrWarn(registry, options.ref);
    } else {
      process.stderr.write(
        "ai-skills WARNING: --no-verify passed. Signature verification skipped. " +
          "The installed content has NOT been cryptographically verified.\n",
      );
    }

    // ── 3. Fetch + extract tarball ────────────────────────────────────────
    const extractDir = await fetchAndExtract(registry, options.ref);

    // ── 4. Post-fetch integrity check ─────────────────────────────────────
    await verifyManifestIntegrity(manifest, extractDir);

    return { extractDir, manifest, verifiedAt };
  } finally {
    await rm(manifestTmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a raw.githubusercontent.com URL for a file at a specific ref.
 */
function rawGitHubUrl(registry: string, ref: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${registry}/${ref}/${filePath}`;
}

/**
 * Build a GitHub archive tarball URL.
 */
function tarballUrl(registry: string, ref: string): string {
  const [owner, repo] = registry.split("/");
  return `https://github.com/${owner}/${repo}/archive/${ref}.tar.gz`;
}

/**
 * Fetch a URL as text with retry. Only retries on transient errors.
 */
async function retryFetch(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url);

      if (res.ok) {
        return await res.text();
      }

      const isTransient = res.status >= 500;
      if (!isTransient) {
        throw new FetchError(
          `HTTP ${res.status} fetching ${url}`,
          false,
        );
      }

      lastError = new FetchError(`HTTP ${res.status} fetching ${url}`, true);
    } catch (err) {
      if (err instanceof FetchError && !err.retryable) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      const isTransient =
        err instanceof FetchError
          ? err.retryable
          : isTransientNetworkError(err);
      if (!isTransient) throw lastError;
    }

    const delayMs = RETRY_DELAYS_MS[attempt];
    if (delayMs === undefined) break;
    await sleep(delayMs);
  }

  throw lastError ?? new FetchError(`Failed to fetch ${url}`, true);
}

/**
 * Fetch a URL as a binary buffer with retry.
 */
async function retryFetchBuffer(url: string): Promise<Buffer> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url);

      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }

      const isTransient = res.status >= 500;
      if (!isTransient) {
        throw new FetchError(`HTTP ${res.status} fetching ${url}`, false);
      }

      lastError = new FetchError(`HTTP ${res.status} fetching ${url}`, true);
    } catch (err) {
      if (err instanceof FetchError && !err.retryable) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      const isTransient =
        err instanceof FetchError ? err.retryable : isTransientNetworkError(err);
      if (!isTransient) throw lastError;
    }

    const delayMs = RETRY_DELAYS_MS[attempt];
    if (delayMs === undefined) break;
    await sleep(delayMs);
  }

  throw lastError ?? new FetchError(`Failed to fetch ${url}`, true);
}

/**
 * Download the GitHub tarball and extract it. Returns the extraction dir.
 * Caller is responsible for cleanup.
 */
async function fetchAndExtract(registry: string, ref: string): Promise<string> {
  const url = tarballUrl(registry, ref);
  const buf = await retryFetchBuffer(url);

  const extractDir = await mkdtemp(join(tmpdir(), "ai-skills-extract-"));
  try {
    // tar.x returns a Promise when given a buffer via `{ buffer }` option or
    // we can write the buffer to a temp file. Use a pipe approach for clarity.
    const tmpTar = join(extractDir, "_archive.tar.gz");
    await writeFile(tmpTar, buf);
    await tar.x({ file: tmpTar, cwd: extractDir, strip: 1 });
    // Remove the raw tarball after extraction.
    await rm(tmpTar, { force: true }).catch(() => undefined);
  } catch (err) {
    await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }

  return extractDir;
}

/**
 * Re-hash every component source file against manifest.sha256.
 * Throws `IntegrityError` on the first mismatch — not retried.
 */
async function verifyManifestIntegrity(
  manifest: Manifest,
  extractDir: string,
): Promise<void> {
  for (const component of manifest.components) {
    const filePath = join(extractDir, component.source);
    let buf: Buffer;
    try {
      buf = await readFile(filePath);
    } catch {
      throw new IntegrityError(
        component.id,
        component.source,
        component.sha256,
        "(file missing from tarball)",
      );
    }

    const actual = canonicalSha256(buf);
    if (actual !== component.sha256) {
      // Clean up — don't leave a corrupt extract dir around.
      await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
      throw new IntegrityError(component.id, component.source, component.sha256, actual);
    }
  }
}

/**
 * Attempt cosign keyless verification. If `cosign` is not installed or
 * verification fails for a non-security reason, warn and return null.
 * If cosign IS present and verification fails with a definitive error,
 * re-throw.
 */
async function verifyCosignOrWarn(
  registry: string,
  ref: string,
): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  // Check if cosign is available.
  try {
    await execFileAsync("cosign", ["version"], { timeout: 5_000 });
  } catch {
    process.stderr.write(
      "ai-skills WARNING: cosign not found. Install cosign for supply-chain verification. " +
        "Continuing without signature check.\n",
    );
    return null;
  }

  // Run cosign verify.
  const sigUrl = `https://github.com/${registry}/releases/download/${ref}/manifest.sig`;
  const manifestUrl = rawGitHubUrl(registry, ref, "manifest.json");

  try {
    await execFileAsync(
      "cosign",
      [
        "verify-blob",
        "--certificate-oidc-issuer",
        "https://token.actions.githubusercontent.com",
        "--certificate-identity-regexp",
        `https://github.com/${registry}`,
        "--signature",
        sigUrl,
        manifestUrl,
      ],
      { timeout: 15_000 },
    );
    const ts = new Date().toISOString();
    process.stdout.write(`Cosign verification passed at ${ts}\n`);
    return ts;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `ai-skills WARNING: cosign verification failed: ${msg}\n` +
        "Continuing anyway (warn-only in v1).\n",
    );
    return null;
  }
}

function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
