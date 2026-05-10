import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONFIG_SCHEMA_VERSION = 1;

export type TelemetryConsent = "enabled" | "disabled";

export interface AiSkillsConfig {
  schemaVersion: number;
  anonymousId: string;
  telemetry?: {
    consent: TelemetryConsent;
    updatedAt: string;
  };
}

export interface ConfigPathOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export interface TelemetryDecisionOptions {
  config?: AiSkillsConfig | null;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
}

export interface TelemetryDecision {
  enabled: boolean;
  reason:
    | "env-enabled"
    | "env-disabled"
    | "do-not-track"
    | "ci"
    | "non-tty"
    | "config-enabled"
    | "config-disabled"
    | "unset";
}

export function getConfigPath(options: ConfigPathOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();

  const override = env["AI_SKILLS_CONFIG_DIR"]?.trim();
  if (override) return join(override, "config.json");

  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "ai-skills", "config.json");
  }
  if (platform === "win32") {
    const appData = env["APPDATA"]?.trim() || join(home, "AppData", "Roaming");
    return join(appData, "ai-skills", "config.json");
  }
  const xdgConfig = env["XDG_CONFIG_HOME"]?.trim() || join(home, ".config");
  return join(xdgConfig, "ai-skills", "config.json");
}

export async function readConfig(configPath = getConfigPath()): Promise<AiSkillsConfig | null> {
  if (!existsSync(configPath)) return null;
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isConfig(parsed)) {
    throw new Error(`Config at ${configPath} has an unexpected shape.`);
  }
  return parsed;
}

export async function writeConfig(config: AiSkillsConfig, configPath = getConfigPath()): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const tmpPath = `${configPath}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmpPath, JSON.stringify(config, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(tmpPath, configPath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function updateTelemetryConsent(
  consent: TelemetryConsent,
  configPath = getConfigPath(),
): Promise<AiSkillsConfig> {
  const existing = await readConfig(configPath).catch(() => null);
  const config: AiSkillsConfig = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    anonymousId: existing?.anonymousId ?? randomUUID(),
    telemetry: {
      consent,
      updatedAt: new Date().toISOString(),
    },
  };
  await writeConfig(config, configPath);
  return config;
}

export function decideTelemetry(options: TelemetryDecisionOptions = {}): TelemetryDecision {
  const env = options.env ?? process.env;
  const envValue = env["AI_SKILLS_TELEMETRY"]?.trim().toLowerCase();

  if (isTruthyEnv(env["DO_NOT_TRACK"])) return { enabled: false, reason: "do-not-track" };
  if (envValue === "0" || envValue === "false" || envValue === "off") {
    return { enabled: false, reason: "env-disabled" };
  }
  if (envValue === "1" || envValue === "true" || envValue === "on") {
    return { enabled: true, reason: "env-enabled" };
  }
  if (isTruthyEnv(env["CI"])) return { enabled: false, reason: "ci" };
  if (options.isTTY === false) return { enabled: false, reason: "non-tty" };

  const consent = options.config?.telemetry?.consent;
  if (consent === "enabled") return { enabled: true, reason: "config-enabled" };
  if (consent === "disabled") return { enabled: false, reason: "config-disabled" };
  return { enabled: false, reason: "unset" };
}

export function hasTelemetryEnvOverride(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["AI_SKILLS_TELEMETRY"] !== undefined || isTruthyEnv(env["DO_NOT_TRACK"]);
}

export function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "off";
}

function isConfig(value: unknown): value is AiSkillsConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (obj["schemaVersion"] !== CONFIG_SCHEMA_VERSION) return false;
  if (typeof obj["anonymousId"] !== "string" || obj["anonymousId"].length === 0) return false;
  const telemetry = obj["telemetry"];
  if (telemetry === undefined) return true;
  if (telemetry === null || typeof telemetry !== "object" || Array.isArray(telemetry)) return false;
  const t = telemetry as Record<string, unknown>;
  return (
    (t["consent"] === "enabled" || t["consent"] === "disabled") &&
    typeof t["updatedAt"] === "string" &&
    t["updatedAt"].length > 0
  );
}
