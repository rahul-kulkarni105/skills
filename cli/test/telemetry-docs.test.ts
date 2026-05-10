import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TELEMETRY_ALLOWED_PROPERTIES,
  TELEMETRY_ERROR_KINDS,
  TELEMETRY_EVENTS,
} from "../src/telemetry.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("telemetry docs", () => {
  it("keeps README pointed at the detailed telemetry schema", () => {
    const readme = readRepoFile("README.md");
    expect(readme).toContain("docs/telemetry.md");
  });

  it("documents every emitted event in docs/telemetry.md", () => {
    const telemetryDoc = readRepoFile("docs/telemetry.md");

    for (const event of TELEMETRY_EVENTS) {
      expect(telemetryDoc, `docs/telemetry.md is missing ${event}`).toContain(event);
    }
  });

  it("keeps docs/telemetry.md in sync with the telemetry property allowlist", () => {
    const telemetryDoc = readRepoFile("docs/telemetry.md");

    for (const property of TELEMETRY_ALLOWED_PROPERTIES) {
      expect(telemetryDoc, `docs/telemetry.md is missing ${property}`).toContain(property);
    }
  });

  it("keeps docs/telemetry.md in sync with error classifications", () => {
    const telemetryDoc = readRepoFile("docs/telemetry.md");

    for (const errorKind of TELEMETRY_ERROR_KINDS) {
      expect(telemetryDoc, `docs/telemetry.md is missing ${errorKind}`).toContain(errorKind);
    }
  });
});

function readRepoFile(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}
