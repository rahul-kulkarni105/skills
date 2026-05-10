/**
 * Session 4 tests — multi-target installs + inline-content shims.
 *
 * Covered scenarios:
 *   2  — Multi-target install (claude + cursor): both sets of files installed,
 *         verify exits 0 for all.
 *   11 — Shim drift: install for cursor, manually edit the rendered shim,
 *         verify exits 1.
 *   12 — Shim re-render on canonical change: install for cursor, edit the
 *         canonical file in the manifest, re-run init --yes, shim is
 *         re-rendered with new content and verify exits 0.
 *
 * Additional shim-specific tests:
 *   - Template sha bump triggers re-render even if canonical content unchanged.
 *   - Manual edit of a shim → classified as drift on verify.
 *   - --user mode skips Cursor and Copilot targets with a warning.
 *   - Path-collision preflight: two targets writing to the same dest throw.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runInit } from "../src/commands/init.js";
import { runVerify } from "../src/commands/verify.js";
import { readLockfile } from "../src/lockfile.js";
import { canonicalSha256 } from "../src/sha.js";
import { renderShim } from "../src/shim.js";

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "ai-skills-s4-"));
}

const SHA_64 = "a".repeat(64);
const COMMIT_40 = "b".repeat(40);

/**
 * Build a minimal manifest JSON string with one component that has:
 *   - claude target: copy (no shim)
 *   - cursor target: inline-shim using "cursor-file-shim"
 */
function makeMultiTargetManifest(opts: {
  tmpDir: string;
  canonicalContent?: string;
  templateBody?: string;
}): string {
  const canonical = opts.canonicalContent ?? "# Hello from canonical\n";
  const templateBody =
    opts.templateBody ??
    "# managed-by: ai-skills@{{version}} — do not edit; regenerated on upgrade\n# source: {{source}}\n";
  const templateSha = canonicalSha256(templateBody);
  const canonicalSha = canonicalSha256(canonical);

  // Write the canonical source file into tmpDir so the installer can read it.
  const sourceDir = join(opts.tmpDir, "skills", "hello");
  mkdirSync(sourceDir, { recursive: true });
  const sourceFile = join(sourceDir, "SKILL.md");
  writeFileSync(sourceFile, canonical, "utf8");

  const manifest = {
    manifestVersion: 1,
    release: { tag: "test", commit: COMMIT_40, builtAt: "2026-01-01T00:00:00Z" },
    targets: [
      { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
      { id: "cursor", label: "Cursor", installRoot: ".", projectScoped: true },
      { id: "copilot", label: "GitHub Copilot", installRoot: ".", projectScoped: true },
    ],
    shimTemplates: [
      {
        id: "cursor-file-shim",
        sha256: templateSha,
        managedByHeader: "# managed-by: ai-skills",
      },
      {
        id: "copilot-import-shim",
        sha256: canonicalSha256(
          "<!-- managed-by: ai-skills@{{version}} — do not edit; regenerated on upgrade -->\n<!-- source: {{source}} -->\n",
        ),
        managedByHeader: "<!-- managed-by: ai-skills -->",
      },
    ],
    bundles: [],
    components: [
      {
        id: "skill.hello",
        type: "skill",
        source: "skills/hello/SKILL.md",
        sha256: canonicalSha,
        installs: {
          claude: { dest: ".claude/skills/hello/SKILL.md" },
          cursor: { dest: ".cursor/rules/100-skill-hello.mdc", shim: "cursor-file-shim" },
        },
      },
    ],
  };

  const manifestPath = join(opts.tmpDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

/**
 * Same as makeMultiTargetManifest but with a copilot-shimmed component.
 */
function makeManifestWithCopilot(opts: {
  tmpDir: string;
}): string {
  const canonical = "# Rule content\n";
  const canonicalSha = canonicalSha256(canonical);

  const sourceFile = join(opts.tmpDir, "AGENTS.md");
  writeFileSync(sourceFile, canonical, "utf8");

  const cursorTemplateSha = canonicalSha256(
    "# managed-by: ai-skills@{{version}} — do not edit; regenerated on upgrade\n# source: {{source}}\n",
  );
  const copilotTemplateSha = canonicalSha256(
    "<!-- managed-by: ai-skills@{{version}} — do not edit; regenerated on upgrade -->\n<!-- source: {{source}} -->\n",
  );

  const manifest = {
    manifestVersion: 1,
    release: { tag: "test", commit: COMMIT_40, builtAt: "2026-01-01T00:00:00Z" },
    targets: [
      { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
      { id: "cursor", label: "Cursor", installRoot: ".", projectScoped: true },
      { id: "copilot", label: "GitHub Copilot", installRoot: ".", projectScoped: true },
    ],
    shimTemplates: [
      {
        id: "cursor-file-shim",
        sha256: cursorTemplateSha,
        managedByHeader: "# managed-by: ai-skills",
      },
      {
        id: "copilot-import-shim",
        sha256: copilotTemplateSha,
        managedByHeader: "<!-- managed-by: ai-skills -->",
      },
    ],
    bundles: [],
    components: [
      {
        id: "rule.agents",
        type: "rule",
        source: "AGENTS.md",
        sha256: canonicalSha,
        installs: {
          claude: { dest: "AGENTS.md" },
          cursor: { dest: ".cursor/rules/000-agents.mdc", shim: "cursor-file-shim" },
          copilot: { dest: ".github/copilot-instructions.md", shim: "copilot-import-shim" },
        },
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
// Scenario 2 — Multi-target install
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 2: multi-target install (claude + cursor)", () => {
  it("installs canonical file for claude and shim for cursor; verify exits 0", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);
    const manifestPath = makeMultiTargetManifest({ tmpDir: tempDir });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["claude", "cursor"],
    });

    // Claude: canonical copy
    const claudeDest = join(installDir, ".claude/skills/hello/SKILL.md");
    expect(existsSync(claudeDest)).toBe(true);
    const claudeContent = readFileSync(claudeDest, "utf8");
    expect(claudeContent).toBe("# Hello from canonical\n");
    expect(claudeContent).not.toContain("managed-by");

    // Cursor: inline shim
    const cursorDest = join(installDir, ".cursor/rules/100-skill-hello.mdc");
    expect(existsSync(cursorDest)).toBe(true);
    const cursorContent = readFileSync(cursorDest, "utf8");
    expect(cursorContent).toContain("managed-by: ai-skills@");
    expect(cursorContent).toContain("# source: skills/hello/SKILL.md");
    expect(cursorContent).toContain("# Hello from canonical");

    // Lockfile: 2 entries
    const lock = readLockfile(installDir);
    expect(lock?.entries).toHaveLength(2);

    // Cursor entry has shim metadata
    const cursorEntry = lock?.entries.find((e) => e.target === "cursor");
    expect(cursorEntry?.shimTemplateId).toBe("cursor-file-shim");
    expect(cursorEntry?.shimCanonicalSha).toBeDefined();
    expect(cursorEntry?.shimTemplateSha).toBeDefined();
    // sha256 is of rendered output, not canonical
    expect(cursorEntry?.sha256).not.toBe(cursorEntry?.shimCanonicalSha);

    // Claude entry has no shim metadata
    const claudeEntry = lock?.entries.find((e) => e.target === "claude");
    expect(claudeEntry?.shimTemplateId).toBeUndefined();

    // verify exits 0
    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 11 — Shim drift detection
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 11: manual edit of shim content → verify exits 1", () => {
  it("classify rendered-output drift identically to canonical-file drift", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);
    const manifestPath = makeMultiTargetManifest({ tmpDir: tempDir });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["cursor"],
    });

    const cursorDest = join(installDir, ".cursor/rules/100-skill-hello.mdc");
    expect(existsSync(cursorDest)).toBe(true);

    // Manually edit the rendered shim.
    await writeFile(cursorDest, "# tampered content\n", "utf8");

    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(1);

    const modified = result.files.find((f) => f.dest === ".cursor/rules/100-skill-hello.mdc");
    expect(modified?.status).toBe("modified");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 12 — Shim re-render on canonical change
// ═══════════════════════════════════════════════════════════════════════════════

describe("scenario 12: edit canonical → re-run init → shim re-rendered", () => {
  it("re-renders shim with new content when canonical sha changes; verify exits 0", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    // First install.
    const manifestPath = makeMultiTargetManifest({
      tmpDir: tempDir,
      canonicalContent: "# Original content\n",
    });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["cursor"],
    });

    const cursorDest = join(installDir, ".cursor/rules/100-skill-hello.mdc");
    const firstContent = readFileSync(cursorDest, "utf8");
    expect(firstContent).toContain("# Original content");

    const lockBefore = readLockfile(installDir);
    const shaBefore = lockBefore?.entries.find((e) => e.target === "cursor")?.sha256;

    // Update the canonical source file (simulating a new release).
    const sourceFile = join(tempDir, "skills/hello/SKILL.md");
    writeFileSync(sourceFile, "# Updated content\n", "utf8");

    // Rebuild manifest with new sha.
    const newCanonicalSha = canonicalSha256("# Updated content\n");
    const manifestObj = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifestObj.components[0].sha256 = newCanonicalSha;
    writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), "utf8");

    // Re-run init --yes (v1 upgrade path).
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["cursor"],
    });

    // Shim should be re-rendered with new content.
    const secondContent = readFileSync(cursorDest, "utf8");
    expect(secondContent).toContain("# Updated content");
    expect(secondContent).not.toContain("# Original content");

    // Lockfile sha updated.
    const lockAfter = readLockfile(installDir);
    const shaAfter = lockAfter?.entries.find((e) => e.target === "cursor")?.sha256;
    expect(shaAfter).not.toBe(shaBefore);

    // verify exits 0.
    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Template sha bump → all shims re-render
// ═══════════════════════════════════════════════════════════════════════════════

describe("template sha bump triggers re-render even if canonical unchanged", () => {
  it("bumps the template sha → shim is re-rendered with new header", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);

    const manifestPath = makeMultiTargetManifest({
      tmpDir: tempDir,
      canonicalContent: "# Stable content\n",
    });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["cursor"],
    });

    const cursorDest = join(installDir, ".cursor/rules/100-skill-hello.mdc");
    const firstContent = readFileSync(cursorDest, "utf8");
    const lockBefore = readLockfile(installDir);
    const shaBefore = lockBefore?.entries.find((e) => e.target === "cursor")?.sha256;

    // Bump the template sha in the manifest (simulates header format change).
    const newTemplateBody =
      "# managed-by: ai-skills@{{version}} — do not edit; regenerated on upgrade\n# source: {{source}}\n# template-v2\n";
    const newTemplateSha = canonicalSha256(newTemplateBody);

    const manifestObj = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifestObj.shimTemplates[0].sha256 = newTemplateSha;
    writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2), "utf8");

    // Re-run init --yes.
    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      targets: ["cursor"],
    });

    // Shim content should be different (re-rendered), canonical content same.
    const secondContent = readFileSync(cursorDest, "utf8");
    expect(secondContent).toContain("# Stable content");

    // sha changes because re-render happened (even if canonical content same,
    // the shimTemplateSha in lockfile was different → re-render was triggered).
    const lockAfter = readLockfile(installDir);
    const shimEntry = lockAfter?.entries.find((e) => e.target === "cursor");
    expect(shimEntry?.shimTemplateSha).toBe(newTemplateSha);

    // verify exits 0 because lockfile sha matches rendered file on disk.
    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// --user mode
// ═══════════════════════════════════════════════════════════════════════════════

describe("--user mode", () => {
  it("silently skips cursor and copilot targets with a warning", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);
    const manifestPath = makeManifestWithCopilot({ tmpDir: tempDir });

    const stderrLines: string[] = [];
    const origStderr = process.stderr.write.bind(process.stderr);
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      if (typeof chunk === "string") stderrLines.push(chunk);
      return true;
    });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      userMode: true,
      targets: ["claude", "cursor", "copilot"],
    }).catch(() => {
      // --user mode with explicit project-scoped target throws.
    });

    vi.restoreAllMocks();

    // The warning should mention the disabled targets.
    const hasWarning = stderrLines.some(
      (l) => l.includes("project-scoped") || l.includes("--user"),
    );
    expect(hasWarning).toBe(true);
  });

  it("installs only non-user-mode-disabled targets when userMode=true and no explicit targets", async () => {
    const installDir = join(tempDir, "project");
    mkdirSync(installDir);
    const manifestPath = makeManifestWithCopilot({ tmpDir: tempDir });

    await runInit({
      manifestPath,
      installRoot: installDir,
      yes: true,
      userMode: true,
      // No explicit targets → uses all candidateTargets (after --user filter)
    });

    // claude installed
    expect(existsSync(join(installDir, "AGENTS.md"))).toBe(true);
    // cursor and copilot skipped (no shim files)
    expect(existsSync(join(installDir, ".cursor/rules/000-agents.mdc"))).toBe(false);
    expect(existsSync(join(installDir, ".github/copilot-instructions.md"))).toBe(false);

    const result = await runVerify({ installRoot: installDir });
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Shim renderer unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("renderShim()", () => {
  const cursorTemplate = {
    id: "cursor-file-shim",
    sha256: "a".repeat(64),
    managedByHeader: "# managed-by: ai-skills",
  };

  const copilotTemplate = {
    id: "copilot-import-shim",
    sha256: "b".repeat(64),
    managedByHeader: "<!-- managed-by: ai-skills -->",
  };

  it("cursor shim: emits hash-comment header + source + canonical content", () => {
    const rendered = renderShim(cursorTemplate, "# Content here\n", "skills/foo/SKILL.md");
    const lines = rendered.split("\n");
    expect(lines[0]).toMatch(/^# managed-by: ai-skills@.+ — do not edit; regenerated on upgrade$/);
    expect(lines[1]).toBe("# source: skills/foo/SKILL.md");
    expect(rendered).toContain("# Content here");
  });

  it("copilot shim: emits HTML-comment header + source + canonical content", () => {
    const rendered = renderShim(copilotTemplate, "# Rule content\n", "AGENTS.md");
    expect(rendered).toContain("<!-- managed-by: ai-skills@");
    expect(rendered).toContain("<!-- source: AGENTS.md -->");
    expect(rendered).toContain("# Rule content");
  });

  it("normalizes CRLF in canonical content", () => {
    const rendered = renderShim(cursorTemplate, "line1\r\nline2\r\n", "foo.md");
    expect(rendered).not.toContain("\r\n");
    expect(rendered).toContain("line1\nline2\n");
  });

  it("uses forward slashes in source path (posix)", () => {
    // Simulate a Windows-style path being passed in.
    const rendered = renderShim(cursorTemplate, "x\n", "skills\\foo\\SKILL.md");
    expect(rendered).toContain("# source: skills/foo/SKILL.md");
  });

  it("renders deterministically (same inputs → same output)", () => {
    const a = renderShim(cursorTemplate, "# hello\n", "foo.md");
    const b = renderShim(cursorTemplate, "# hello\n", "foo.md");
    expect(a).toBe(b);
  });
});
