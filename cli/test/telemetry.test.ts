import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateTelemetryConsent } from "../src/config.js";
import {
  captureTelemetry,
  classifyError,
  completeCommand,
  createTelemetryContext,
  failCommand,
  flushTelemetry,
  sanitizeProperties,
  startCommand,
  type TelemetryClient,
} from "../src/telemetry.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ai-skills-telemetry-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("sanitizeProperties()", () => {
  it("keeps only allowlisted properties", () => {
    const result = sanitizeProperties({
      command: "init",
      duration_ms: 123,
      installRoot: "/Users/alice/project",
      manifestPath: "/Users/alice/manifest.json",
      error_stack: "secret stack",
      token: "secret",
    });

    expect(result).toEqual({ command: "init", duration_ms: 123 });
  });

  it("does not keep object-valued properties", () => {
    const result = sanitizeProperties({
      command: "init",
      targets: ["claude", "cursor"],
      source_kind: "local_manifest",
      nested: { unsafe: true },
    });

    expect(result).toEqual({
      command: "init",
      targets: ["claude", "cursor"],
      source_kind: "local_manifest",
    });
  });
});

describe("createTelemetryContext()", () => {
  it("is disabled when consent is missing", async () => {
    const client = makeClient();

    const context = await createTelemetryContext({
      configPath: join(tempDir, "config.json"),
      env: { AI_SKILLS_POSTHOG_KEY: "phc_test" },
      isTTY: true,
      client,
    });

    expect(context.enabled).toBe(false);
    expect(context.client).toBeNull();
  });

  it("uses an injected client when consent and key are present", async () => {
    const configPath = join(tempDir, "config.json");
    const config = await updateTelemetryConsent("enabled", configPath);
    const client = makeClient();

    const context = await createTelemetryContext({
      configPath,
      env: { AI_SKILLS_POSTHOG_KEY: "phc_test" },
      isTTY: true,
      client,
    });

    expect(context.enabled).toBe(true);
    expect(context.client).toBe(client);
    expect(context.anonymousId).toBe(config.anonymousId);
  });

  it("is disabled when no PostHog key is configured", async () => {
    const configPath = join(tempDir, "config.json");
    await updateTelemetryConsent("enabled", configPath);

    const context = await createTelemetryContext({
      configPath,
      env: {},
      isTTY: true,
    });

    expect(context.enabled).toBe(false);
    expect(context.reason).toBe("missing-key");
  });

  it("debug mode prints the decision and does not send events", async () => {
    const configPath = join(tempDir, "config.json");
    await updateTelemetryConsent("enabled", configPath);
    const client = makeClient();
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const context = await createTelemetryContext({
        configPath,
        env: { AI_SKILLS_POSTHOG_KEY: "phc_test", AI_SKILLS_TELEMETRY_DEBUG: "1" },
        isTTY: true,
        client,
      });

      captureTelemetry(context, "command_started", { command: "init" });

      expect(context.enabled).toBe(false);
      expect(context.reason).toBe("debug");
      expect(client.captures).toEqual([]);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("ai-skills telemetry debug:"),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe("event capture helpers", () => {
  it("captures start and complete events with sanitized properties", async () => {
    const configPath = join(tempDir, "config.json");
    await updateTelemetryConsent("enabled", configPath);
    const client = makeClient();
    const context = await createTelemetryContext({
      configPath,
      env: { AI_SKILLS_POSTHOG_KEY: "phc_test" },
      isTTY: true,
      client,
    });

    const startedAt = startCommand(context, "init", {
      source_kind: "local_manifest",
      installRoot: "/Users/alice/project",
    });
    completeCommand(context, "init", startedAt, { exit_code: 0 });

    expect(client.captures.map((c) => c.event)).toEqual([
      "command_started",
      "command_completed",
    ]);
    expect(client.captures[0]?.properties).toMatchObject({
      command: "init",
      source_kind: "local_manifest",
    });
    expect(JSON.stringify(client.captures)).not.toContain("/Users/alice");
  });

  it("captures failures with error_kind only", async () => {
    const configPath = join(tempDir, "config.json");
    await updateTelemetryConsent("enabled", configPath);
    const client = makeClient();
    const context = await createTelemetryContext({
      configPath,
      env: { AI_SKILLS_POSTHOG_KEY: "phc_test" },
      isTTY: true,
      client,
    });

    failCommand(context, "init", Date.now(), new Error("manifest invalid at $.release"), {}, {
      exceptionSampleRate: 0,
    });

    expect(client.captures[0]?.event).toBe("command_failed");
    expect(client.captures[0]?.properties?.["error_kind"]).toBe("manifest_validation_error");
    expect(JSON.stringify(client.captures)).not.toContain("manifest invalid");
  });

  it("captures sampled exception events without raw messages or stacks", async () => {
    const configPath = join(tempDir, "config.json");
    await updateTelemetryConsent("enabled", configPath);
    const client = makeClient();
    const context = await createTelemetryContext({
      configPath,
      env: { AI_SKILLS_POSTHOG_KEY: "phc_test" },
      isTTY: true,
      client,
    });

    failCommand(
      context,
      "verify",
      Date.now(),
      new Error("EACCES permission denied at /Users/alice/project token=secret"),
      { installRoot: "/Users/alice/project" },
      { exceptionSampleRate: 1, random: () => 0 },
    );

    expect(client.captures.map((c) => c.event)).toEqual([
      "command_failed",
      "command_exception_sampled",
    ]);
    expect(client.captures[1]?.properties).toMatchObject({
      command: "verify",
      error_kind: "filesystem_permission_error",
    });
    expect(JSON.stringify(client.captures)).not.toContain("EACCES permission denied");
    expect(JSON.stringify(client.captures)).not.toContain("/Users/alice");
    expect(JSON.stringify(client.captures)).not.toContain("secret");
  });

  it("swallows capture and shutdown failures", async () => {
    const context = {
      enabled: true,
      reason: "config-enabled",
      anonymousId: "id",
      client: {
        capture: vi.fn(() => {
          throw new Error("network down");
        }),
        shutdown: vi.fn(async () => {
          throw new Error("network down");
        }),
      },
    };

    expect(() => captureTelemetry(context, "command_started", { command: "init" })).not.toThrow();
    await expect(flushTelemetry(context)).resolves.toBeUndefined();
  });
});

describe("classifyError()", () => {
  it("groups known error shapes without exposing messages", () => {
    expect(classifyError(new Error("manifest invalid at $.release"))).toBe(
      "manifest_validation_error",
    );
    expect(classifyError(new Error("Lockfile at x is corrupt"))).toBe("lockfile_error");
    expect(classifyError(new Error("Integrity check failed for component"))).toBe(
      "integrity_error",
    );
    expect(classifyError(new Error("EACCES permission denied"))).toBe(
      "filesystem_permission_error",
    );
  });

  it("redacts before classifying unknown errors", () => {
    expect(classifyError(new Error("unexpected token=secret at /Users/alice/project"))).toBe(
      "unknown_error",
    );
  });
});

function makeClient(): TelemetryClient & {
  captures: Array<{ event: string; properties?: Record<string, unknown> }>;
} {
  const captures: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  return {
    captures,
    capture: (message) => captures.push({
      event: message.event,
      ...(message.properties ? { properties: message.properties } : {}),
    }),
    shutdown: vi.fn(async () => undefined),
  };
}
