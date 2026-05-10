/**
 * End-to-end tests for `init` + `verify` (Session 2).
 *
 * All tests run against a temporary directory so they don't mutate the repo.
 * The local manifest.json at the repo root is used as the manifest source.
 *
 * Covered scenarios (from the approved plan):
 *   1  — Fresh install → verify exits 0.
 *   4  — Modify a managed file → verify exits 1.
 *   14 — Pre-existing file: adopt path / overwrite path.
 *   21 — Fault during installation → staging dir cleaned up, no lockfile written.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLI_VERSION } from "../src/version.js";

import { runInit } from "../src/commands/init.js";
import { runVerify } from "../src/commands/verify.js";
import { readLockfile, LOCKFILE_NAME } from "../src/lockfile.js";

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = join(REPO_ROOT, "manifest.json");

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Create a fresh temp dir; cleaned up in afterEach. */
function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "ai-skills-e2e-"));
}

/** Run a minimal `init` in `--yes` mode for the claude target. */
async function initInDir(
  installRoot: string,
  manifestPath = MANIFEST_PATH,
): Promise<void> {
  await runInit({
    manifestPath,
    installRoot,
    yes: true,
    targets: ["claude"],
  });
}

/** Verify and return the exit code + file list. */
async function verifyInDir(installRoot: string) {
  return runVerify({ installRoot });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Minimal valid manifest used for fault-injection tests only.
 * One component whose source file does NOT exist on disk → cp will throw.
 */
function makeFaultyManifest(tmpDir: string, missingSourceRel: string): string {
  const SHA = "a".repeat(64);
  const COMMIT = "b".repeat(40);
  const manifest = {
    manifestVersion: 1,
    release: { tag: "test", commit: COMMIT, builtAt: "2026-01-01T00:00:00Z" },
    targets: [
      { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
    ],
    shimTemplates: [],
    bundles: [],
    components: [
      {
        id: "rule.ghost",
        type: "rule",
        source: missingSourceRel,
        sha256: SHA,
        installs: {
          claude: { dest: "GHOST.md" },
        },
      },
    ],
  };
  const manifestPath = join(tmpDir, "faulty-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

// ─── State ────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  tempDir = makeTempDir();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1 — Fresh install → verify exits 0
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 1: fresh install", () => {
  it("installs claude-target files and verify returns exit 0", async () => {
    await initInDir(tempDir);

    // Lockfile must exist
    expect(existsSync(join(tempDir, LOCKFILE_NAME))).toBe(true);

    const lockfile = readLockfile(tempDir);
    expect(lockfile).not.toBeNull();
    expect(lockfile!.entries.length).toBeGreaterThan(0);
    expect(lockfile!.schemaVersion).toBe(1);
    expect(lockfile!.entries.every((e) => e.target === "claude")).toBe(true);

    // All installed files must exist on disk
    for (const entry of lockfile!.entries) {
      expect(existsSync(join(tempDir, entry.dest))).toBe(true);
    }

    // verify → exit 0
    const result = await verifyInDir(tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.files.every((f) => f.status === "ok")).toBe(true);
  });

  it("lockfile records correct fields", async () => {
    await initInDir(tempDir);
    const lockfile = readLockfile(tempDir);
    expect(lockfile).not.toBeNull();
    expect(lockfile!.schemaVersion).toBe(1);
    expect(lockfile!.cliVersion).toBe(CLI_VERSION);
    expect(typeof lockfile!.ref).toBe("string");
    expect(lockfile!.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 4 — Modify a managed file → verify exits 1
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 4: drift detection", () => {
  it("verify exits 1 when a managed file is modified", async () => {
    await initInDir(tempDir);

    const lockfile = readLockfile(tempDir);
    expect(lockfile).not.toBeNull();

    // Pick the first non-adopted entry to tamper with.
    const firstEntry = lockfile!.entries.find((e) => !e.adopted);
    expect(firstEntry).toBeDefined();
    const targetFile = join(tempDir, firstEntry!.dest);

    // Append a line to the file — this changes its canonical sha256.
    const original = await readFile(targetFile, "utf8");
    await writeFile(targetFile, original + "\n# tampered by test\n", "utf8");

    const result = await verifyInDir(tempDir);
    expect(result.exitCode).toBe(1);

    const modified = result.files.find((f) => f.dest === firstEntry!.dest);
    expect(modified?.status).toBe("modified");
  });

  it("verify exits 1 when a managed file is deleted", async () => {
    await initInDir(tempDir);

    const lockfile = readLockfile(tempDir);
    const firstEntry = lockfile!.entries[0];
    expect(firstEntry).toBeDefined();

    await rm(join(tempDir, firstEntry!.dest), { force: true });

    const result = await verifyInDir(tempDir);
    expect(result.exitCode).toBe(1);

    const missing = result.files.find((f) => f.dest === firstEntry!.dest);
    expect(missing?.status).toBe("missing");
  });

  it("verify exits 2 when no lockfile exists", async () => {
    const result = await verifyInDir(tempDir);
    expect(result.exitCode).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 14 — Pre-existing file: adopt / overwrite
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 14: pre-existing file handling", () => {
  it("adopt: keeps existing content; lockfile records adopted:true and disk sha", async () => {
    // Determine which dest one of the claude components installs to.
    const { loadManifest } = await import("../src/manifest.js");
    const manifest = await loadManifest(MANIFEST_PATH);
    const claudeComponent = manifest.components.find(
      (c) => "claude" in c.installs,
    );
    expect(claudeComponent).toBeDefined();
    const destRel = claudeComponent!.installs["claude"]!.dest;

    // Pre-populate the dest with custom content.
    const destAbs = join(tempDir, destRel);
    mkdirSync(dirname(destAbs), { recursive: true });
    const customContent = "# custom pre-existing content\n";
    writeFileSync(destAbs, customContent, "utf8");

    // Run init with "adopt" choice for that file; pre-select all components to
    // skip the interactive component picker.
    const allClaudeComponentIds = manifest.components
      .filter((c) => "claude" in c.installs)
      .map((c) => c.id);

    await runInit({
      manifestPath: MANIFEST_PATH,
      installRoot: tempDir,
      yes: false,
      targets: ["claude"],
      components: allClaudeComponentIds,
      onExistingFile: async (dest) => {
        return dest === destRel ? "adopt" : "overwrite";
      },
    });

    // Adopted file must still have the original content.
    const content = await readFile(destAbs, "utf8");
    expect(content).toBe(customContent);

    // Lockfile entry must have adopted: true and the sha of custom content.
    const lockfile = readLockfile(tempDir);
    const adoptedEntry = lockfile!.entries.find((e) => e.dest === destRel);
    expect(adoptedEntry?.adopted).toBe(true);
    // The recorded sha must differ from the manifest sha (different content).
    expect(adoptedEntry?.sha256).not.toBe(claudeComponent!.sha256);

    // verify: the adopted file matches lockfile sha → exit 0 for that file.
    const result = await verifyInDir(tempDir);
    const file = result.files.find((f) => f.dest === destRel);
    expect(file?.status).toBe("ok");
  });

  it("overwrite: replaces existing content; lockfile records manifest sha", async () => {
    const { loadManifest } = await import("../src/manifest.js");
    const manifest = await loadManifest(MANIFEST_PATH);
    const claudeComponent = manifest.components.find(
      (c) => "claude" in c.installs,
    );
    expect(claudeComponent).toBeDefined();
    const destRel = claudeComponent!.installs["claude"]!.dest;
    const destAbs = join(tempDir, destRel);

    mkdirSync(dirname(destAbs), { recursive: true });
    writeFileSync(destAbs, "# this should be overwritten\n", "utf8");

    const allClaudeComponentIds = manifest.components
      .filter((c) => "claude" in c.installs)
      .map((c) => c.id);

    await runInit({
      manifestPath: MANIFEST_PATH,
      installRoot: tempDir,
      yes: false,
      targets: ["claude"],
      components: allClaudeComponentIds,
      onExistingFile: async () => "overwrite",
    });

    // File should now have canonical content (not our custom content).
    const content = await readFile(destAbs, "utf8");
    expect(content).not.toBe("# this should be overwritten\n");

    const lockfile = readLockfile(tempDir);
    const entry = lockfile!.entries.find((e) => e.dest === destRel);
    expect(entry?.adopted).toBeUndefined();
    expect(entry?.sha256).toBe(claudeComponent!.sha256);

    const result = await verifyInDir(tempDir);
    const file = result.files.find((f) => f.dest === destRel);
    expect(file?.status).toBe("ok");
  });

  it("skip: file is not tracked in lockfile", async () => {
    const { loadManifest } = await import("../src/manifest.js");
    const manifest = await loadManifest(MANIFEST_PATH);
    const claudeComponent = manifest.components.find(
      (c) => "claude" in c.installs,
    );
    expect(claudeComponent).toBeDefined();
    const destRel = claudeComponent!.installs["claude"]!.dest;
    const destAbs = join(tempDir, destRel);

    mkdirSync(dirname(destAbs), { recursive: true });
    const customContent = "# skipped\n";
    writeFileSync(destAbs, customContent, "utf8");

    const allClaudeComponentIds = manifest.components
      .filter((c) => "claude" in c.installs)
      .map((c) => c.id);

    await runInit({
      manifestPath: MANIFEST_PATH,
      installRoot: tempDir,
      yes: false,
      targets: ["claude"],
      components: allClaudeComponentIds,
      onExistingFile: async (dest) => (dest === destRel ? "skip" : "overwrite"),
    });

    // File should retain its original content.
    const content = await readFile(destAbs, "utf8");
    expect(content).toBe(customContent);

    // Lockfile must NOT contain an entry for this dest.
    const lockfile = readLockfile(tempDir);
    const skippedEntry = lockfile?.entries.find((e) => e.dest === destRel);
    expect(skippedEntry).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 21 — Fault during installation → staging cleaned up, no lockfile
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 21: staging cleanup on fault", () => {
  it("staging dir is removed and no lockfile is written when source file is missing", async () => {
    // Build a manifest that references a source file that does not exist.
    const manifestDir = join(tempDir, "repo");
    mkdirSync(manifestDir, { recursive: true });
    const faultyManifestPath = makeFaultyManifest(manifestDir, "does-not-exist.md");

    await expect(
      runInit({
        manifestPath: faultyManifestPath,
        installRoot: tempDir,
        yes: true,
        targets: ["claude"],
      }),
    ).rejects.toThrow();

    // No lockfile must have been written.
    expect(existsSync(join(tempDir, LOCKFILE_NAME))).toBe(false);

    // Staging base dir must not exist (or be empty) — the installer cleans up.
    const stagingBase = join(tempDir, ".ai-skills.staging");
    if (existsSync(stagingBase)) {
      // It may exist as an empty directory. It must not contain any files.
      const entries = readdirSync(stagingBase, { recursive: true });
      expect(entries.length).toBe(0);
    }
  });

  it("no partial files are left in the install root on staging failure", async () => {
    const manifestDir = join(tempDir, "repo");
    mkdirSync(manifestDir, { recursive: true });
    const faultyManifestPath = makeFaultyManifest(manifestDir, "does-not-exist.md");

    await expect(
      runInit({
        manifestPath: faultyManifestPath,
        installRoot: tempDir,
        yes: true,
        targets: ["claude"],
      }),
    ).rejects.toThrow();

    // GHOST.md must not exist in install root.
    expect(existsSync(join(tempDir, "GHOST.md"))).toBe(false);
  });
});
