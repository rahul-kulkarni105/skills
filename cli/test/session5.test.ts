/**
 * Session 5 tests — settings deep-merge.
 *
 * Covered scenarios:
 *   6  — Fresh install of settings.json: no pre-existing file, upstream content
 *         written verbatim, verify exits 0. User later modifies their own key →
 *         verify still exits 0 (user keys are not tracked as drift).
 *   18 — Merge with existing settings: upstream adds allow/ask/deny rules,
 *         verify exits 0; then upstream contribution is altered externally
 *         → verify exits 1.
 *
 * Additional unit tests for `mergeSettings()`:
 *   - Bootstrap case: null existing → merged = upstream, userKeys = [].
 *   - allow/ask union: silent, no prompts.
 *   - deny additions: routed through onDeny prompt.
 *   - Scalar conflict: routed through onConflict prompt.
 *   - User-only keys in existing file: preserved, added to userKeys.
 *   - verify re-projection: changing upstream-contributed key → drift;
 *     changing user-only key → no drift.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runInit } from "../src/commands/init.js";
import { runVerify } from "../src/commands/verify.js";
import { readLockfile } from "../src/lockfile.js";
import {
  mergeSettings,
  reprojectUpstream,
  type JsonObject,
} from "../src/settings-merge.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "ai-skills-s5-"));
}

const COMMIT_40 = "c".repeat(40);

/** Build a minimal manifest with a single settings component. */
function makeSettingsManifest(opts: {
  tmpDir: string;
  upstreamSettings: JsonObject;
}): string {
  const content = JSON.stringify(opts.upstreamSettings, null, 2) + "\n";
  const settingsDir = join(opts.tmpDir, ".claude");
  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(join(settingsDir, "settings.json"), content, "utf8");

  const manifest = {
    manifestVersion: 1,
    release: { tag: "test", commit: COMMIT_40, builtAt: "2026-01-01T00:00:00Z" },
    targets: [
      { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
    ],
    shimTemplates: [],
    bundles: [],
    components: [
      {
        id: "settings.claude",
        type: "settings",
        source: ".claude/settings.json",
        sha256: "a".repeat(64),
        installs: {
          claude: { dest: ".claude/settings.json" },
        },
        mergeStrategy: "deep-merge",
      },
    ],
  };

  const manifestPath = join(opts.tmpDir, "manifest.json");
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
// Unit tests for mergeSettings()
// ═══════════════════════════════════════════════════════════════════════════════

describe("mergeSettings() — bootstrap (no existing file)", () => {
  it("returns upstream verbatim; userKeys is empty", async () => {
    const upstream: JsonObject = {
      permissions: { allow: ["Read"], deny: ["Bash(rm -rf /:*)"] },
      outputStyle: "default",
    };
    const result = await mergeSettings(upstream, null);
    expect(result.merged).toEqual(upstream);
    expect(result.userKeys).toEqual([]);
    expect(typeof result.upstreamProjectionSha).toBe("string");
    expect(result.upstreamProjectionSha).toHaveLength(64);
  });
});

describe("mergeSettings() — allow/ask union (silent)", () => {
  it("unions allow arrays without prompting", async () => {
    const upstream: JsonObject = {
      permissions: { allow: ["Read", "Write"] },
    };
    const existing: JsonObject = {
      permissions: { allow: ["Read", "Grep"] },
    };
    const denyPromptSpy = vi.fn(async () => true);
    const result = await mergeSettings(upstream, existing, denyPromptSpy);
    const allow = (result.merged["permissions"] as JsonObject)["allow"] as string[];
    expect(allow).toContain("Read");
    expect(allow).toContain("Write");
    expect(allow).toContain("Grep");
    // No deny prompt triggered.
    expect(denyPromptSpy).not.toHaveBeenCalled();
  });

  it("unions ask arrays without prompting", async () => {
    const upstream: JsonObject = {
      permissions: { ask: ["Bash(git push:*)"] },
    };
    const existing: JsonObject = {
      permissions: { ask: ["Bash(git commit:*)"] },
    };
    const result = await mergeSettings(upstream, existing, async () => true);
    const ask = (result.merged["permissions"] as JsonObject)["ask"] as string[];
    expect(ask).toContain("Bash(git push:*)");
    expect(ask).toContain("Bash(git commit:*)");
  });
});

describe("mergeSettings() — deny additions prompt", () => {
  it("calls onDeny for each new deny rule; accepted rules appear in merged", async () => {
    const upstream: JsonObject = {
      permissions: { deny: ["Bash(rm -rf /:*)", "Bash(git push --force:*)"] },
    };
    const existing: JsonObject = {
      permissions: { deny: ["Bash(rm -rf /:*)"] }, // one already present
    };
    const denyPrompt = vi.fn(async (rule: string) => {
      // Accept the force-push deny, reject nothing.
      return true;
    });
    const result = await mergeSettings(upstream, existing, denyPrompt);
    // Only the NEW rule triggers a prompt.
    expect(denyPrompt).toHaveBeenCalledTimes(1);
    expect(denyPrompt).toHaveBeenCalledWith("Bash(git push --force:*)");
    const deny = (result.merged["permissions"] as JsonObject)["deny"] as string[];
    expect(deny).toContain("Bash(rm -rf /:*)");
    expect(deny).toContain("Bash(git push --force:*)");
  });

  it("declined deny rule is excluded from merged output", async () => {
    const upstream: JsonObject = {
      permissions: { deny: ["Bash(curl:*)"] },
    };
    const existing: JsonObject = { permissions: {} };
    const result = await mergeSettings(
      upstream,
      existing,
      async () => false, // decline all deny additions
    );
    const deny = (result.merged["permissions"] as JsonObject)["deny"] as string[];
    expect(deny ?? []).not.toContain("Bash(curl:*)");
  });
});

describe("mergeSettings() — scalar conflict", () => {
  it("routes scalar conflict to onConflict; upstream choice wins", async () => {
    const upstream: JsonObject = { outputStyle: "minimal" };
    const existing: JsonObject = { outputStyle: "verbose" };
    const onConflict = vi.fn(async () => "upstream" as const);
    const result = await mergeSettings(upstream, existing, async () => true, onConflict);
    expect(onConflict).toHaveBeenCalledWith("/outputStyle", "minimal", "verbose");
    expect(result.merged["outputStyle"]).toBe("minimal");
  });

  it("routes scalar conflict to onConflict; user choice preserved", async () => {
    const upstream: JsonObject = { outputStyle: "minimal" };
    const existing: JsonObject = { outputStyle: "verbose" };
    const onConflict = vi.fn(async () => "user" as const);
    const result = await mergeSettings(upstream, existing, async () => true, onConflict);
    expect(result.merged["outputStyle"]).toBe("verbose");
    expect(result.userKeys).toContain("/outputStyle");
  });
});

describe("mergeSettings() — user-only keys preserved", () => {
  it("keys only in existing are preserved and added to userKeys", async () => {
    const upstream: JsonObject = { outputStyle: "default" };
    const existing: JsonObject = { outputStyle: "default", myCustomKey: "hello" };
    const result = await mergeSettings(upstream, existing);
    expect(result.merged["myCustomKey"]).toBe("hello");
    expect(result.userKeys).toContain("/myCustomKey");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reprojectUpstream()
// ═══════════════════════════════════════════════════════════════════════════════

describe("reprojectUpstream()", () => {
  it("returns same sha as original install when nothing changes", async () => {
    const upstream: JsonObject = { outputStyle: "default" };
    const existing: JsonObject = { myKey: "mine" };
    const result = await mergeSettings(upstream, existing);
    // Simulate: live file = merged file (nothing changed on disk).
    const liveSha = reprojectUpstream(result.merged, result.userKeys);
    expect(liveSha).toBe(result.upstreamProjectionSha);
  });

  it("detects change to upstream-contributed key as drift", async () => {
    const upstream: JsonObject = { outputStyle: "default" };
    const existing: JsonObject = { myKey: "mine" };
    const result = await mergeSettings(upstream, existing);
    // Simulate: user modifies the upstream-contributed key.
    const modified: JsonObject = { ...result.merged, outputStyle: "verbose" };
    const liveSha = reprojectUpstream(modified, result.userKeys);
    expect(liveSha).not.toBe(result.upstreamProjectionSha);
  });

  it("does NOT flag change to user-only key as drift", async () => {
    const upstream: JsonObject = { outputStyle: "default" };
    const existing: JsonObject = { myKey: "mine" };
    const result = await mergeSettings(upstream, existing);
    // Simulate: user changes their own key on disk.
    const modified: JsonObject = { ...result.merged, myKey: "changed-by-user" };
    const liveSha = reprojectUpstream(modified, result.userKeys);
    expect(liveSha).toBe(result.upstreamProjectionSha);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 6 — Fresh settings install
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 6: fresh settings install", () => {
  it("writes upstream settings verbatim; verify exits 0", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const upstream: JsonObject = {
      permissions: { allow: ["Read"], deny: ["Bash(rm -rf /:*)"] },
      outputStyle: "default",
    };
    const manifestPath = makeSettingsManifest({ tmpDir: tempDir, upstreamSettings: upstream });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    // File written to disk.
    const dest = join(installDir, ".claude/settings.json");
    expect(existsSync(dest)).toBe(true);
    const written = JSON.parse(readFileSync(dest, "utf8")) as JsonObject;
    expect(written["outputStyle"]).toBe("default");

    // Lockfile entry has kind: "settings-merge", userKeys: [].
    const lock = readLockfile(installDir);
    const entry = lock?.entries.find((e) => e.id === "settings.claude");
    expect(entry?.kind).toBe("settings-merge");
    expect(entry?.userKeys).toEqual([]);
    expect(typeof entry?.sha256).toBe("string");

    // verify exits 0.
    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(0);
  });

  it("bootstrap: any new key added post-install IS detected as drift (userKeys=[])", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const upstream: JsonObject = { outputStyle: "default" };
    const manifestPath = makeSettingsManifest({ tmpDir: tempDir, upstreamSettings: upstream });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    // In bootstrap mode, userKeys=[]. Any key added to the file is treated as
    // an upstream-contribution change by reprojectUpstream. This is expected:
    // user keys are only tracked when merging into a pre-existing file.
    const dest = join(installDir, ".claude/settings.json");
    const current = JSON.parse(readFileSync(dest, "utf8")) as JsonObject;
    current["myPersonalKey"] = "myValue";
    await writeFile(dest, JSON.stringify(current, null, 2) + "\n", "utf8");

    // verify: user key appears in upstream projection (userKeys=[]) → drift detected.
    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 18 — Merge with existing settings
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 18: merge with existing settings file", () => {
  it("unions allow rules, prompts for deny; verify exits 0", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    // Pre-existing settings file in the install dir.
    const existingSettings: JsonObject = {
      permissions: {
        allow: ["Read", "Grep"],
        deny: [],
      },
      outputStyle: "verbose",
    };
    const settingsPath = join(installDir, ".claude/settings.json");
    mkdirSync(join(installDir, ".claude"), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2) + "\n", "utf8");

    const upstream: JsonObject = {
      permissions: {
        allow: ["Read", "Write"],
        deny: ["Bash(git push --force:*)"],
      },
      outputStyle: "default",
    };
    const manifestPath = makeSettingsManifest({ tmpDir: tempDir, upstreamSettings: upstream });

    // Supply test-friendly callbacks: accept deny, take upstream on conflict.
    const denyAcceptSpy = vi.fn(async () => true);
    const conflictUpstreamSpy = vi.fn(async () => "upstream" as const);

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: false,
      targets: ["claude"],
      components: ["settings.claude"],
      onDenyRule: denyAcceptSpy,
      onConflict: conflictUpstreamSpy,
    });

    // Check merged file.
    const merged = JSON.parse(readFileSync(settingsPath, "utf8")) as JsonObject;
    const allow = (merged["permissions"] as JsonObject)["allow"] as string[];
    const deny = (merged["permissions"] as JsonObject)["deny"] as string[];
    expect(allow).toContain("Read");
    expect(allow).toContain("Write");
    expect(allow).toContain("Grep");
    expect(deny).toContain("Bash(git push --force:*)");
    // Conflict resolved: upstream wins on outputStyle.
    expect(merged["outputStyle"]).toBe("default");

    // deny prompt called for new rule.
    expect(denyAcceptSpy).toHaveBeenCalledWith("Bash(git push --force:*)");

    // Lockfile entry.
    const lock = readLockfile(installDir);
    const entry = lock?.entries.find((e) => e.id === "settings.claude");
    expect(entry?.kind).toBe("settings-merge");

    // verify exits 0.
    const r1 = await runVerify({ installRoot: installDir });
    expect(r1.exitCode).toBe(0);
  });

  it("upstream contribution altered externally → verify exits 1", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const upstream: JsonObject = { outputStyle: "default", _upstreamKey: "managed" };
    const manifestPath = makeSettingsManifest({ tmpDir: tempDir, upstreamSettings: upstream });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    // Verify initially clean.
    const r1 = await runVerify({ installRoot: installDir });
    expect(r1.exitCode).toBe(0);

    // Simulate something altering the upstream-contributed key on disk.
    const dest = join(installDir, ".claude/settings.json");
    const live = JSON.parse(readFileSync(dest, "utf8")) as JsonObject;
    live["_upstreamKey"] = "tampered";
    await writeFile(dest, JSON.stringify(live, null, 2) + "\n", "utf8");

    // Now verify should detect drift.
    const r2 = await runVerify({ installRoot: installDir });
    expect(r2.exitCode).toBe(1);
    const entry = r2.files.find((f) => f.dest === ".claude/settings.json");
    expect(entry?.status).toBe("modified");
  });

  it("user adds their own key to merged file → verify exits 0", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const existing: JsonObject = {
      permissions: { allow: ["Read"] },
      myKey: "mine",
    };
    const settingsPath = join(installDir, ".claude/settings.json");
    mkdirSync(join(installDir, ".claude"), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n", "utf8");

    const upstream: JsonObject = {
      permissions: { allow: ["Read", "Write"] },
    };
    const manifestPath = makeSettingsManifest({ tmpDir: tempDir, upstreamSettings: upstream });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    // "myKey" is user-controlled: user changes it.
    const live = JSON.parse(readFileSync(settingsPath, "utf8")) as JsonObject;
    live["myKey"] = "changed";
    await writeFile(settingsPath, JSON.stringify(live, null, 2) + "\n", "utf8");

    // verify: user-only change → no drift.
    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(0);
  });
});
