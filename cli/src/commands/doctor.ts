import { access, constants } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readLockfile, LockfileError, LOCKFILE_SCHEMA_VERSION } from "../lockfile.js";
import { CLI_VERSION } from "../version.js";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DoctorOptions {
  /** Directory to check write permission and lockfile compatibility for. */
  installRoot: string;
}

export interface DoctorResult {
  /** Overall pass/warn/fail. Fail = at least one hard-error check failed. */
  status: "pass" | "warn" | "fail";
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Run preflight checks and print a human-readable report.
 *
 * Checks (hard = fail, soft = warn):
 *   1. Node.js version ≥ 18  (hard)
 *   2. Write permission to installRoot  (hard)
 *   3. Network reachability (GitHub)  (soft — warn only)
 *   4. cosign present  (soft — warn only)
 *   5. CLI version vs lockfile schemaVersion compatibility  (hard if newer major)
 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorResult> {
  const checks: CheckResult[] = await Promise.all([
    checkNodeVersion(),
    checkWritePermission(options.installRoot),
    checkNetworkReachability(),
    checkCosign(),
    checkLockfileCompatibility(options.installRoot),
  ]);

  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const status = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  // Print report.
  for (const c of checks) {
    const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗";
    process.stdout.write(`  ${icon}  ${c.name}: ${c.message}\n`);
  }

  if (status === "fail") {
    process.stdout.write("\nSome checks failed. Fix the issues above before running ai-skills.\n");
  } else if (status === "warn") {
    process.stdout.write("\nAll hard checks passed. Some optional features are unavailable.\n");
  } else {
    process.stdout.write("\nAll checks passed.\n");
  }

  return { status, checks };
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkNodeVersion(): Promise<CheckResult> {
  const name = "Node.js version";
  const versionStr = process.version; // e.g. "v20.11.0"
  const major = parseInt(versionStr.slice(1), 10);
  if (major >= 18) {
    return { name, status: "ok", message: `${versionStr} (≥18 required)` };
  }
  return {
    name,
    status: "fail",
    message: `${versionStr} — Node ≥18 is required. Please upgrade.`,
  };
}

async function checkWritePermission(installRoot: string): Promise<CheckResult> {
  const name = "Write permission";
  try {
    await access(installRoot, constants.W_OK);
    return { name, status: "ok", message: `${installRoot} is writable` };
  } catch {
    return {
      name,
      status: "fail",
      message: `Cannot write to ${installRoot}. Check directory permissions.`,
    };
  }
}

async function checkNetworkReachability(): Promise<CheckResult> {
  const name = "Network (GitHub)";
  try {
    const res = await fetch("https://api.github.com", {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok || res.status === 403 /* rate-limited but reachable */) {
      return { name, status: "ok", message: "github.com reachable" };
    }
    return {
      name,
      status: "warn",
      message: `github.com returned HTTP ${res.status} — network fetch may fail`,
    };
  } catch {
    return {
      name,
      status: "warn",
      message: "github.com unreachable. Network fetch will fail.",
    };
  }
}

async function checkCosign(): Promise<CheckResult> {
  const name = "cosign (supply-chain verification)";
  try {
    const { stdout } = await execFileAsync("cosign", ["version"], { timeout: 5_000 });
    const version = stdout.split("\n")[0]?.trim() ?? "unknown";
    return { name, status: "ok", message: `found — ${version}` };
  } catch {
    return {
      name,
      status: "warn",
      message:
        "cosign not found. Install from https://docs.sigstore.dev/cosign/system_config/installation/ " +
        "for supply-chain verification. Continuing without it.",
    };
  }
}

async function checkLockfileCompatibility(installRoot: string): Promise<CheckResult> {
  const name = "Lockfile compatibility";
  let lockfile;
  try {
    lockfile = readLockfile(installRoot);
  } catch (err) {
    if (err instanceof LockfileError) {
      return { name, status: "fail", message: err.message };
    }
    throw err;
  }

  if (lockfile === null) {
    return { name, status: "ok", message: "no lockfile yet (not initialized)" };
  }

  if (lockfile.schemaVersion > LOCKFILE_SCHEMA_VERSION) {
    return {
      name,
      status: "fail",
      message:
        `Lockfile schema v${lockfile.schemaVersion} requires a newer CLI ` +
        `(this CLI supports schema v${LOCKFILE_SCHEMA_VERSION}). Run \`npm i -g @rahulkulkarniskills/ai-skills\` to upgrade.`,
    };
  }

  return {
    name,
    status: "ok",
    message: `lockfile schema v${lockfile.schemaVersion}, CLI v${CLI_VERSION}`,
  };
}
