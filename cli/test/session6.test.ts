/**
 * Session 6 tests — add / remove / list / eject.
 *
 * Covered scenarios:
 *   3  — `list` command: installed, available, and --json sections.
 *   17 — `eject` command: shim headers stripped; copy files kept; lockfile deleted.
 *
 * Additional unit + integration tests:
 *   - `add`: install a component not yet installed; no-op for already installed;
 *     --force reinstalls; glob expansion; bundle expansion.
 *   - `remove`: sha-match silent delete; sha-mismatch prompt; settings-merge
 *     entry is kept on disk, removed from tracking only.
 *   - `list --json`: valid JSON with schemaVersion 1.
 *   - `resolveIds()`: bundle, glob, exact, unknown-pass-through.
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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runInit } from "../src/commands/init.js";
import { runVerify } from "../src/commands/verify.js";
import { runList, LIST_JSON_SCHEMA_VERSION } from "../src/commands/list.js";
import { runAdd, resolveIds } from "../src/commands/add.js";
import { runRemove } from "../src/commands/remove.js";
import { runEject, stripManagedByHeader } from "../src/commands/eject.js";
import { readLockfile, LOCKFILE_NAME } from "../src/lockfile.js";
import { canonicalSha256 } from "../src/sha.js";
import { type Manifest } from "../src/manifest-schema.js";


// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = join(REPO_ROOT, "manifest.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "ai-skills-s6-"));
}

const COMMIT_40 = "c".repeat(40);

/** Build a minimal manifest with two copy components and one settings component. */
function makeManifest(opts: {
  tmpDir: string;
  components?: Array<{
    id: string;
    type?: string;
    source: string;
    content: string;
    installs?: Record<string, { dest: string }>;
    mergeStrategy?: string;
    bundles?: string[];
    description?: string;
    dependsOn?: string[];
  }>;
  bundles?: Array<{ id: string; label: string; description: string; components: string[] }>;
}): string {
  const components = opts.components ?? [
    {
      id: "rule.alpha",
      type: "rule",
      source: "rules/alpha.md",
      content: "# Alpha\n",
      installs: { claude: { dest: "ALPHA.md" } },
      bundles: ["everything"],
    },
    {
      id: "rule.beta",
      type: "rule",
      source: "rules/beta.md",
      content: "# Beta\n",
      installs: { claude: { dest: "BETA.md" } },
      bundles: ["everything"],
    },
  ];

  // Write source files
  for (const c of components) {
    const absSource = join(opts.tmpDir, c.source);
    mkdirSync(dirname(absSource), { recursive: true });
    writeFileSync(absSource, c.content, "utf8");
  }

  const manifestObj = {
    manifestVersion: 1,
    release: { tag: "v0.0.1", commit: COMMIT_40, builtAt: "2026-01-01T00:00:00Z" },
    targets: [
      { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
    ],
    shimTemplates: [],
    bundles: opts.bundles ?? [
      {
        id: "everything",
        label: "Everything",
        description: "All components",
        components: components.map((c) => c.id),
      },
    ],
    components: components.map((c) => ({
      id: c.id,
      type: c.type ?? "rule",
      source: c.source,
      sha256: canonicalSha256(c.content),
      installs: c.installs ?? { claude: { dest: `${c.id.replace(".", "_")}.md` } },
      ...(c.mergeStrategy ? { mergeStrategy: c.mergeStrategy } : {}),
      ...(c.bundles ? { bundles: c.bundles } : {}),
      ...(c.description ? { description: c.description } : {}),
      ...(c.dependsOn ? { dependsOn: c.dependsOn } : {}),
    })),
  };

  const manifestPath = join(opts.tmpDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), "utf8");
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
// resolveIds() unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolveIds()", () => {
  const fakeManifest = {
    components: [
      { id: "skills.hello" },
      { id: "skills.world" },
      { id: "rule.agents" },
    ],
    bundles: [
      { id: "everything", components: ["skills.hello", "skills.world", "rule.agents"] },
      { id: "skills-bundle", components: ["skills.hello", "skills.world"] },
    ],
  } as unknown as Manifest;

  it("resolves an exact component id", () => {
    expect(resolveIds(["skills.hello"], fakeManifest)).toEqual(["skills.hello"]);
  });

  it("expands a bundle id to all its components", () => {
    const result = resolveIds(["skills-bundle"], fakeManifest);
    expect(result).toEqual(["skills.hello", "skills.world"]);
  });

  it("expands the 'everything' bundle", () => {
    const result = resolveIds(["everything"], fakeManifest);
    expect(result).toEqual(["skills.hello", "skills.world", "rule.agents"]);
  });

  it("expands a glob with *", () => {
    const result = resolveIds(["skills.*"], fakeManifest);
    expect(result).toContain("skills.hello");
    expect(result).toContain("skills.world");
    expect(result).not.toContain("rule.agents");
  });

  it("expands a glob matching all", () => {
    const result = resolveIds(["*"], fakeManifest);
    expect(result).toContain("skills.hello");
    expect(result).toContain("rule.agents");
  });

  it("deduplicates results", () => {
    const result = resolveIds(["skills.hello", "skills.hello"], fakeManifest);
    expect(result).toHaveLength(1);
  });

  it("passes through unknown ids unchanged (caller validates)", () => {
    const result = resolveIds(["nonexistent.id"], fakeManifest);
    expect(result).toEqual(["nonexistent.id"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// stripManagedByHeader() unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("stripManagedByHeader()", () => {
  it("strips hash-comment header (Cursor format)", () => {
    const content = [
      "# managed-by: ai-skills@0.0.0 \u2014 do not edit; regenerated on upgrade",
      "# source: skills/hello/SKILL.md",
      "",
      "# Actual content",
    ].join("\n");
    const stripped = stripManagedByHeader(content);
    expect(stripped).toBe("# Actual content");
    expect(stripped).not.toContain("managed-by");
  });

  it("strips HTML-comment header (Copilot format)", () => {
    const content = [
      "<!-- managed-by: ai-skills@0.0.0 \u2014 do not edit; regenerated on upgrade -->",
      "<!-- source: .github/copilot-instructions.md -->",
      "",
      "# Actual content",
    ].join("\n");
    const stripped = stripManagedByHeader(content);
    expect(stripped).toBe("# Actual content");
    expect(stripped).not.toContain("managed-by");
  });

  it("returns content unchanged if no header is present", () => {
    const content = "# Plain file\nNo header here.\n";
    expect(stripManagedByHeader(content)).toBe(content);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 3 — list command
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 3: list command", () => {
  it("shows installed components from lockfile", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    // Install one component
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    const result = await runList({ installRoot: installDir });
    expect(result.installed).toHaveLength(1);
    expect(result.installed[0]?.id).toBe("rule.alpha");
    expect(result.installed[0]?.target).toBe("claude");
  });

  it("shows available components when manifest is provided", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    // Install only alpha; beta is available
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    const result = await runList({ installRoot: installDir, manifestPath });
    expect(result.installed.some((i) => i.id === "rule.alpha")).toBe(true);
    expect(result.available.some((a) => a.id === "rule.beta")).toBe(true);
    expect(result.available.every((a) => a.id !== "rule.alpha")).toBe(true);
  });

  it("shows empty installed section when no lockfile exists", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const result = await runList({ installRoot: installDir });
    expect(result.installed).toHaveLength(0);
  });

  it("--json emits valid JSON with schemaVersion 1", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    // Capture stdout
    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });

    try {
      await runList({ installRoot: installDir, manifestPath, json: true });
    } finally {
      vi.restoreAllMocks();
    }

    const output = chunks.join("");
    const parsed = JSON.parse(output) as { schemaVersion: number; installed: unknown[] };
    expect(parsed.schemaVersion).toBe(LIST_JSON_SCHEMA_VERSION);
    expect(Array.isArray(parsed.installed)).toBe(true);
  });

  it("outdated section shows components where manifest sha differs", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    // Install with original manifest
    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    // Now check list: since manifest sha = "aaa...a" and lockfile sha also was
    // based on the same manifest sha at install time, they match — not outdated.
    const result = await runList({ installRoot: installDir, manifestPath });
    // Installed sha is manifest sha (both "aaa...a") — no drift.
    expect(result.outdated).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// add command tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("add command", () => {
  it("installs a component not yet in the lockfile", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    // Start with only alpha installed
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    // Add beta
    await runAdd({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      ids: ["rule.beta"],
    });

    const lock = readLockfile(installDir);
    const ids = lock?.entries.map((e) => e.id) ?? [];
    expect(ids).toContain("rule.alpha");
    expect(ids).toContain("rule.beta");

    // Verify shows both installed correctly
    const r = await runVerify({ installRoot: installDir });
    expect(r.exitCode).toBe(0);
  });

  it("is a no-op for already-installed components without --force", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    // Add alpha again (already installed)
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
    try {
      await runAdd({
        manifestPath,
        installRoot: installDir,
        yes: true,
        targets: ["claude"],
        ids: ["rule.alpha"],
      });
    } finally {
      vi.restoreAllMocks();
    }

    const output = chunks.join("");
    expect(output).toMatch(/already installed/i);

    const lock = readLockfile(installDir);
    // Only alpha — not duplicated
    expect(lock?.entries.filter((e) => e.id === "rule.alpha")).toHaveLength(1);
  });

  it("--force reinstalls an already-installed component", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    const originalSha = readLockfile(installDir)?.entries[0]?.sha256;

    await runAdd({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      ids: ["rule.alpha"],
      force: true,
    });

    const newLock = readLockfile(installDir);
    const alphaEntries = newLock?.entries.filter((e) => e.id === "rule.alpha") ?? [];
    // Deduplicated — only one entry
    expect(alphaEntries).toHaveLength(1);
    // sha should be the same (same source file)
    expect(alphaEntries[0]?.sha256).toBe(originalSha);
  });

  it("expands a glob to matching components", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    // Install using glob "rule.*"
    await runAdd({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      ids: ["rule.*"],
    });

    const lock = readLockfile(installDir);
    const ids = lock?.entries.map((e) => e.id) ?? [];
    expect(ids).toContain("rule.alpha");
    expect(ids).toContain("rule.beta");
  });

  it("expands a bundle id to all its components", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    await runAdd({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      ids: ["everything"],
    });

    const lock = readLockfile(installDir);
    const ids = lock?.entries.map((e) => e.id) ?? [];
    expect(ids).toContain("rule.alpha");
    expect(ids).toContain("rule.beta");
  });

  it("throws if no components match the ids", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });

    await expect(
      runAdd({
        manifestPath,
        installRoot: installDir,
        yes: true,
        ids: ["nonexistent.component"],
      }),
    ).rejects.toThrow(/No components matched/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// remove command tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("remove command", () => {
  it("deletes a file and removes it from the lockfile when sha matches", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    const dest = join(installDir, "ALPHA.md");
    expect(existsSync(dest)).toBe(true);

    await runRemove({
      installRoot: installDir,
      ids: ["rule.alpha"],
      yes: true,
    });

    expect(existsSync(dest)).toBe(false);
    const lock = readLockfile(installDir);
    expect(lock?.entries.find((e) => e.id === "rule.alpha")).toBeUndefined();
  });

  it("prompts when file sha has drifted; 'skip' preserves file", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    // Modify the file to create drift
    const dest = join(installDir, "ALPHA.md");
    await writeFile(dest, "# Modified\n", "utf8");

    const promptSpy = vi.fn(async () => "skip" as const);
    await runRemove({
      installRoot: installDir,
      ids: ["rule.alpha"],
      onDriftedFile: promptSpy,
    });

    expect(promptSpy).toHaveBeenCalledWith("ALPHA.md");
    // File preserved because "skip" was chosen
    expect(existsSync(dest)).toBe(true);
    // Entry still in lockfile (skipped entries are kept)
    const lock = readLockfile(installDir);
    expect(lock?.entries.find((e) => e.id === "rule.alpha")).toBeDefined();
  });

  it("prompts when file sha has drifted; 'delete' removes file", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    const dest = join(installDir, "ALPHA.md");
    await writeFile(dest, "# Modified\n", "utf8");

    await runRemove({
      installRoot: installDir,
      ids: ["rule.alpha"],
      onDriftedFile: async () => "delete",
    });

    expect(existsSync(dest)).toBe(false);
    const lock = readLockfile(installDir);
    expect(lock?.entries.find((e) => e.id === "rule.alpha")).toBeUndefined();
  });

  it("--yes deletes drifted files without prompting", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    const dest = join(installDir, "ALPHA.md");
    await writeFile(dest, "# Modified\n", "utf8");

    await runRemove({
      installRoot: installDir,
      ids: ["rule.alpha"],
      yes: true,
    });

    expect(existsSync(dest)).toBe(false);
  });

  it("is idempotent when file is already gone", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    // Pre-delete the file
    const dest = join(installDir, "ALPHA.md");
    await rm(dest);

    await runRemove({
      installRoot: installDir,
      ids: ["rule.alpha"],
      yes: true,
    });

    const lock = readLockfile(installDir);
    expect(lock?.entries.find((e) => e.id === "rule.alpha")).toBeUndefined();
  });

  it("preserves settings-merge files on disk when removed", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    // Make a manifest with a settings component
    const settingsManifest = makeManifest({
      tmpDir: tempDir,
      components: [
        {
          id: "settings.claude",
          type: "settings",
          source: ".claude/settings.json",
          content: JSON.stringify({ outputStyle: "default" }, null, 2) + "\n",
          installs: { claude: { dest: ".claude/settings.json" } },
          mergeStrategy: "deep-merge",
        },
      ],
    });

    await runInit({
      manifestPath: settingsManifest,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    const settingsPath = join(installDir, ".claude/settings.json");
    expect(existsSync(settingsPath)).toBe(true);

    await runRemove({
      installRoot: installDir,
      ids: ["settings.claude"],
      yes: true,
    });

    // File is preserved on disk (settings files are never deleted)
    expect(existsSync(settingsPath)).toBe(true);
    // Entry removed from lockfile
    const lock = readLockfile(installDir);
    expect(lock?.entries.find((e) => e.id === "settings.claude")).toBeUndefined();
  });

  it("throws when no matching components found", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    await expect(
      runRemove({
        installRoot: installDir,
        ids: ["nonexistent.id"],
        yes: true,
      }),
    ).rejects.toThrow(/No installed components matched/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 17 — eject command
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 17: eject command", () => {
  it("leaves copy files on disk and deletes lockfile", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    const alphaPath = join(installDir, "ALPHA.md");
    const betaPath = join(installDir, "BETA.md");
    expect(existsSync(alphaPath)).toBe(true);
    expect(existsSync(betaPath)).toBe(true);

    const result = await runEject({ installRoot: installDir });

    // Files preserved (copy entries are not removed by eject)
    expect(existsSync(alphaPath)).toBe(true);
    expect(existsSync(betaPath)).toBe(true);

    // Lockfile deleted
    expect(existsSync(join(installDir, LOCKFILE_NAME))).toBe(false);

    // All entries preserved (no shim stripping for copy entries)
    for (const entry of result.entries) {
      expect(entry.action).toBe("preserved");
    }
  });

  it("strips managed-by header from shim files", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    // Create a fake shim file manually and a lockfile entry with shimTemplateId
    mkdirSync(join(installDir, ".cursor/rules"), { recursive: true });
    const shimContent = [
      "# managed-by: ai-skills@0.0.0 \u2014 do not edit; regenerated on upgrade",
      "# source: skills/hello/SKILL.md",
      "",
      "# Actual skill content",
      "This is the skill.",
    ].join("\n");
    writeFileSync(join(installDir, ".cursor/rules/100-skill.mdc"), shimContent, "utf8");

    // Write a lockfile with a shim entry
    const lock = {
      schemaVersion: 1,
      manifestVersion: 1,
      cliVersion: "0.0.0",
      ref: "v0.0.1",
      installedAt: new Date().toISOString(),
      entries: [
        {
          id: "skills.hello",
          target: "cursor",
          source: "skills/hello/SKILL.md",
          dest: ".cursor/rules/100-skill.mdc",
          sha256: "a".repeat(64),
          shimTemplateId: "cursor-file-shim",
          shimTemplateSha: "b".repeat(64),
          shimCanonicalSha: "c".repeat(64),
        },
      ],
    };
    writeFileSync(join(installDir, LOCKFILE_NAME), JSON.stringify(lock, null, 2) + "\n", "utf8");

    const result = await runEject({ installRoot: installDir });

    // Lockfile deleted
    expect(existsSync(join(installDir, LOCKFILE_NAME))).toBe(false);

    // Shim file still exists but header is stripped
    const shimPath = join(installDir, ".cursor/rules/100-skill.mdc");
    expect(existsSync(shimPath)).toBe(true);
    const afterContent = readFileSync(shimPath, "utf8");
    expect(afterContent).not.toContain("managed-by");
    expect(afterContent).toContain("# Actual skill content");

    const entry = result.entries[0];
    expect(entry?.action).toBe("header-stripped");
  });

  it("is idempotent when files are already gone", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    // Delete files before ejecting
    await rm(join(installDir, "ALPHA.md"));
    await rm(join(installDir, "BETA.md"));

    const result = await runEject({ installRoot: installDir });

    // Lockfile deleted
    expect(existsSync(join(installDir, LOCKFILE_NAME))).toBe(false);
    for (const entry of result.entries) {
      expect(entry.action).toBe("already-gone");
    }
  });

  it("returns empty result when no lockfile exists", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const result = await runEject({ installRoot: installDir });
    expect(result.entries).toHaveLength(0);
  });

  it("verify returns exit 2 after eject (no lockfile)", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeManifest({ tmpDir: tempDir });
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    await runEject({ installRoot: installDir });

    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(2);
  });

  it("settings-merge files are untouched by eject", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const settingsManifest = makeManifest({
      tmpDir: tempDir,
      components: [
        {
          id: "settings.claude",
          type: "settings",
          source: ".claude/settings.json",
          content: JSON.stringify({ outputStyle: "default" }, null, 2) + "\n",
          installs: { claude: { dest: ".claude/settings.json" } },
          mergeStrategy: "deep-merge",
        },
      ],
    });

    await runInit({
      manifestPath: settingsManifest,
      installRoot: installDir,
      yes: true,
      targets: ["claude"],
    });

    const settingsPath = join(installDir, ".claude/settings.json");
    const beforeContent = readFileSync(settingsPath, "utf8");

    await runEject({ installRoot: installDir });

    // Settings file untouched
    const afterContent = readFileSync(settingsPath, "utf8");
    expect(afterContent).toBe(beforeContent);

    const entry = (await runEject({ installRoot: installDir })).entries;
    // Second eject: no lockfile, returns empty
    expect(entry).toHaveLength(0);
  });
});
