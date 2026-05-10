import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLogger, redact, resolveLogLevel } from "../src/log.js";

describe("resolveLogLevel()", () => {
  it("defaults to info", () => {
    expect(resolveLogLevel()).toBe("info");
  });

  it("maps --quiet to silent", () => {
    expect(resolveLogLevel({ quiet: true })).toBe("silent");
  });

  it("maps --verbose to debug", () => {
    expect(resolveLogLevel({ verbose: true })).toBe("debug");
  });

  it("uses AI_SKILLS_LOG when valid", () => {
    expect(resolveLogLevel({ env: { AI_SKILLS_LOG: "warn" } })).toBe("warn");
  });

  it("ignores invalid AI_SKILLS_LOG values", () => {
    expect(resolveLogLevel({ env: { AI_SKILLS_LOG: "chatty" } })).toBe("info");
  });
});

describe("createLogger()", () => {
  it("filters messages below the configured level", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "warn", write: (line) => lines.push(line) });

    logger.info("install plan built");
    logger.warn("network unavailable");

    expect(lines).toEqual(["ai-skills warn: network unavailable"]);
  });

  it("redacts fields before writing", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "debug", write: (line) => lines.push(line) });

    logger.debug("loaded config", {
      path: "/Users/alice/project/manifest.json",
      GITHUB_TOKEN: "ghp_secret",
    });

    expect(lines[0]).toContain("[redacted-path]");
    expect(lines[0]).toContain("GITHUB_TOKEN\":\"[redacted]");
    expect(lines[0]).not.toContain("/Users/alice");
    expect(lines[0]).not.toContain("ghp_secret");
  });

  it("writes to a file only when a file path is provided", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ai-skills-log-"));
    try {
      const logPath = join(dir, "debug.log");
      const logger = createLogger({ level: "info", filePath: logPath, write: () => undefined });

      logger.info("diagnostic event");

      expect(readFileSync(logPath, "utf8")).toContain("ai-skills info: diagnostic event");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("redact()", () => {
  it("redacts URL credentials", () => {
    expect(redact("fetch https://alice:secret@example.com/pkg")).toBe(
      "fetch https://[redacted]@example.com/pkg",
    );
  });

  it("redacts bearer tokens", () => {
    expect(redact("Authorization: Bearer abc.def.ghi")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("redacts secret-like key-value pairs", () => {
    expect(redact("GITHUB_TOKEN=ghp_123 password: hunter2")).toBe(
      "GITHUB_TOKEN=[redacted] password: [redacted]",
    );
  });

  it("redacts common absolute paths", () => {
    expect(redact("using /Users/alice/project and /tmp/ai-skills-x")).toBe(
      "using [redacted-path] and [redacted-path]",
    );
  });

  it("redacts Windows paths", () => {
    expect(redact("using C:\\Users\\alice\\project\\manifest.json")).toBe(
      "using [redacted-path]",
    );
  });
});
