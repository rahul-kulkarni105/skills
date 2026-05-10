import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decideTelemetry,
  getConfigPath,
  readConfig,
  updateTelemetryConsent,
} from "../src/config.js";
import {
  runTelemetryDisable,
  runTelemetryEnable,
  runTelemetryStatus,
} from "../src/commands/telemetry.js";
import { runInit } from "../src/commands/init.js";
import { canonicalSha256 } from "../src/sha.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ai-skills-config-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("getConfigPath()", () => {
  it("uses Application Support on macOS", () => {
    expect(getConfigPath({ platform: "darwin", homeDir: "/Users/alice", env: {} })).toBe(
      "/Users/alice/Library/Application Support/ai-skills/config.json",
    );
  });

  it("uses XDG_CONFIG_HOME on Linux", () => {
    expect(getConfigPath({
      platform: "linux",
      homeDir: "/home/alice",
      env: { XDG_CONFIG_HOME: "/xdg" },
    })).toBe("/xdg/ai-skills/config.json");
  });

  it("uses APPDATA on Windows", () => {
    expect(getConfigPath({
      platform: "win32",
      homeDir: "C:\\Users\\alice",
      env: { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" },
    })).toBe("C:\\Users\\alice\\AppData\\Roaming/ai-skills/config.json");
  });

  it("supports an explicit config dir override", () => {
    expect(getConfigPath({ env: { AI_SKILLS_CONFIG_DIR: "/custom" } })).toBe(
      "/custom/config.json",
    );
  });
});

describe("config persistence", () => {
  it("writes and reads telemetry consent with an anonymous id", async () => {
    const configPath = join(tempDir, "config.json");

    const config = await updateTelemetryConsent("enabled", configPath);
    const reread = await readConfig(configPath);

    expect(reread?.anonymousId).toBe(config.anonymousId);
    expect(reread?.telemetry?.consent).toBe("enabled");
    expect(reread?.telemetry?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves anonymous id when consent changes", async () => {
    const configPath = join(tempDir, "config.json");

    const enabled = await updateTelemetryConsent("enabled", configPath);
    const disabled = await updateTelemetryConsent("disabled", configPath);

    expect(disabled.anonymousId).toBe(enabled.anonymousId);
    expect(disabled.telemetry?.consent).toBe("disabled");
  });

  it("rejects invalid config shape", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, "{\"schemaVersion\":999}\n", "utf8");

    await expect(readConfig(configPath)).rejects.toThrow("unexpected shape");
  });
});

describe("decideTelemetry()", () => {
  it("honors DO_NOT_TRACK before enable env", () => {
    expect(decideTelemetry({
      env: { DO_NOT_TRACK: "1", AI_SKILLS_TELEMETRY: "1" },
      isTTY: true,
    })).toEqual({ enabled: false, reason: "do-not-track" });
  });

  it("honors explicit enable env in CI", () => {
    expect(decideTelemetry({
      env: { CI: "1", AI_SKILLS_TELEMETRY: "1" },
      isTTY: false,
    })).toEqual({ enabled: true, reason: "env-enabled" });
  });

  it("disables in CI without explicit enable", () => {
    expect(decideTelemetry({ env: { CI: "1" }, isTTY: true })).toEqual({
      enabled: false,
      reason: "ci",
    });
  });

  it("disables when non-TTY without explicit enable", () => {
    expect(decideTelemetry({ env: {}, isTTY: false })).toEqual({
      enabled: false,
      reason: "non-tty",
    });
  });

  it("uses persisted config when no guard applies", () => {
    expect(decideTelemetry({
      env: {},
      isTTY: true,
      config: {
        schemaVersion: 1,
        anonymousId: "id",
        telemetry: { consent: "enabled", updatedAt: "2026-05-10T00:00:00.000Z" },
      },
    })).toEqual({ enabled: true, reason: "config-enabled" });
  });
});

describe("telemetry commands", () => {
  it("enable and disable update the local config", async () => {
    const configPath = join(tempDir, "config.json");

    await runTelemetryEnable({ configPath, write: () => undefined });
    expect((await readConfig(configPath))?.telemetry?.consent).toBe("enabled");

    await runTelemetryDisable({ configPath, write: () => undefined });
    expect((await readConfig(configPath))?.telemetry?.consent).toBe("disabled");
  });

  it("status prints effective state and config path", async () => {
    const configPath = join(tempDir, "config.json");
    const lines: string[] = [];
    await updateTelemetryConsent("enabled", configPath);

    await runTelemetryStatus({
      configPath,
      env: {},
      isTTY: true,
      write: (message) => lines.push(message),
    });

    expect(lines.join("")).toContain("Telemetry: enabled (config-enabled)");
    expect(lines.join("")).toContain(configPath);
  });
});

describe("init telemetry consent prompt", () => {
  it("prompts once on interactive init when no decision exists", async () => {
    const configPath = join(tempDir, "config.json");
    const manifestPath = makeSingleRuleManifest(tempDir);
    const onTelemetryConsent = vi.fn(async () => true);

    await runInit({
      manifestPath,
      installRoot: join(tempDir, "project"),
      yes: false,
      isTTY: true,
      telemetryEnv: {},
      telemetryConfigPath: configPath,
      onTelemetryConsent,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    expect(onTelemetryConsent).toHaveBeenCalledTimes(1);
    expect((await readConfig(configPath))?.telemetry?.consent).toBe("enabled");

    await runInit({
      manifestPath,
      installRoot: join(tempDir, "project-2"),
      yes: false,
      isTTY: true,
      telemetryEnv: {},
      telemetryConfigPath: configPath,
      onTelemetryConsent,
      targets: ["claude"],
      components: ["rule.alpha"],
    });

    expect(onTelemetryConsent).toHaveBeenCalledTimes(1);
  });

  it("does not prompt in --yes, CI, non-TTY, or env override modes", async () => {
    const manifestPath = makeSingleRuleManifest(tempDir);

    for (const [name, opts] of [
      ["yes", { yes: true, isTTY: true, telemetryEnv: {} }],
      ["ci", { yes: false, isTTY: true, telemetryEnv: { CI: "1" } }],
      ["non-tty", { yes: false, isTTY: false, telemetryEnv: {} }],
      ["env", { yes: false, isTTY: true, telemetryEnv: { AI_SKILLS_TELEMETRY: "0" } }],
    ] as const) {
      const configPath = join(tempDir, `${name}.json`);
      const onTelemetryConsent = vi.fn(async () => true);
      await runInit({
        manifestPath,
        installRoot: join(tempDir, `project-${name}`),
        telemetryConfigPath: configPath,
        onTelemetryConsent,
        targets: ["claude"],
        components: ["rule.alpha"],
        ...opts,
      });

      expect(onTelemetryConsent).not.toHaveBeenCalled();
      expect(existsSync(configPath)).toBe(false);
    }
  });
});

function makeSingleRuleManifest(root: string): string {
  const sourceRel = "rules/alpha.md";
  const sourceAbs = join(root, sourceRel);
  const content = "# Alpha\n";
  const manifestPath = join(root, "manifest.json");
  const manifest = {
    manifestVersion: 1,
    release: { tag: "test", commit: "a".repeat(40), builtAt: "2026-05-10T00:00:00.000Z" },
    targets: [
      { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
    ],
    shimTemplates: [],
    bundles: [],
    components: [
      {
        id: "rule.alpha",
        type: "rule",
        source: sourceRel,
        sha256: canonicalSha256(content),
        installs: { claude: { dest: "ALPHA.md" } },
      },
    ],
  };

  return writeFixture(sourceAbs, content, manifestPath, JSON.stringify(manifest, null, 2));
}

function writeFixture(sourceAbs: string, sourceContent: string, manifestPath: string, manifestContent: string): string {
  const sourceDir = sourceAbs.slice(0, sourceAbs.lastIndexOf("/"));
  // Synchronous setup keeps the helper tiny and deterministic for tests.
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(sourceAbs, sourceContent, "utf8");
  writeFileSync(manifestPath, manifestContent, "utf8");
  return manifestPath;
}
