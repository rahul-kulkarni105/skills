import { PostHog } from "posthog-node";
import { decideTelemetry, isTruthyEnv, readConfig } from "./config.js";
import { redact } from "./log.js";
import { CLI_VERSION } from "./version.js";

export const TELEMETRY_EVENTS = [
  "command_started",
  "command_completed",
  "command_failed",
  "command_exception_sampled",
  "doctor_check_completed",
  "install_plan_built",
  "install_completed",
  "verify_completed",
  "list_completed",
  "add_completed",
  "remove_completed",
  "eject_completed",
  "telemetry_consent_changed",
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

export const TELEMETRY_ERROR_KINDS = [
  "manifest_validation_error",
  "lockfile_error",
  "network_fetch_error",
  "integrity_error",
  "settings_merge_error",
  "filesystem_permission_error",
  "unknown_error",
] as const;

export type TelemetryErrorKind = (typeof TELEMETRY_ERROR_KINDS)[number];

export interface TelemetryClient {
  capture(message: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    disableGeoip?: boolean;
    sendFeatureFlags?: boolean;
  }): void;
  shutdown(timeoutMs?: number): Promise<void> | void;
}

export interface TelemetryContext {
  client: TelemetryClient | null;
  anonymousId: string;
  enabled: boolean;
  reason: string;
}

export interface TelemetryOptions {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  client?: TelemetryClient;
}

export interface FailCommandOptions {
  exceptionSampleRate?: number;
  random?: () => number;
}

export type TelemetryProperties = Record<string, unknown>;

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
export const TELEMETRY_ALLOWED_PROPERTIES = [
  "cli_version",
  "node_major",
  "platform",
  "arch",
  "command",
  "targets",
  "target_count",
  "component_count",
  "id_count",
  "written_count",
  "adopted_count",
  "skipped_count",
  "removed_count",
  "drift_count",
  "duration_ms",
  "exit_code",
  "error_kind",
  "source_kind",
  "user_mode",
  "yes_mode",
  "network_fetch_used",
  "cosign_available",
  "json",
  "force",
  "cascade",
  "has_manifest",
  "telemetry_reason",
] as const;

const ALLOWED_PROPS = new Set<string>(TELEMETRY_ALLOWED_PROPERTIES);

export async function createTelemetryContext(options: TelemetryOptions = {}): Promise<TelemetryContext> {
  const env = options.env ?? process.env;
  const config = await readConfig(options.configPath).catch(() => null);
  const decision = decideTelemetry({
    config,
    env,
    ...(options.isTTY !== undefined ? { isTTY: options.isTTY } : {}),
  });

  const apiKey = env["AI_SKILLS_POSTHOG_KEY"]?.trim();
  if (isTruthyEnv(env["AI_SKILLS_TELEMETRY_DEBUG"])) {
    process.stderr.write(
      `ai-skills telemetry debug: enabled=${decision.enabled && Boolean(apiKey || options.client)} ` +
        `reason=${decision.reason} key=${apiKey ? "configured" : "missing"}\n`,
    );
    return {
      client: null,
      anonymousId: config?.anonymousId ?? "anonymous",
      enabled: false,
      reason: "debug",
    };
  }

  const enabled = decision.enabled && Boolean(apiKey || options.client);
  return {
    client: enabled ? options.client ?? newPostHogClient(apiKey!) : null,
    anonymousId: config?.anonymousId ?? "anonymous",
    enabled,
    reason: enabled ? decision.reason : apiKey ? decision.reason : "missing-key",
  };
}

export function captureTelemetry(
  context: TelemetryContext,
  event: TelemetryEvent,
  properties: TelemetryProperties = {},
): void {
  if (!context.enabled || !context.client) return;
  try {
    context.client.capture({
      distinctId: context.anonymousId,
      event,
      properties: sanitizeProperties({
        ...baseProperties(),
        ...properties,
        telemetry_reason: context.reason,
      }),
      disableGeoip: true,
      sendFeatureFlags: false,
    });
  } catch {
    // Telemetry must never affect command behavior.
  }
}

export function startCommand(
  context: TelemetryContext,
  command: string,
  properties: TelemetryProperties = {},
): number {
  const startedAt = Date.now();
  captureTelemetry(context, "command_started", { command, ...properties });
  return startedAt;
}

export function completeCommand(
  context: TelemetryContext,
  command: string,
  startedAt: number,
  properties: TelemetryProperties = {},
): void {
  captureTelemetry(context, "command_completed", {
    command,
    duration_ms: Date.now() - startedAt,
    ...properties,
  });
}

export function failCommand(
  context: TelemetryContext,
  command: string,
  startedAt: number,
  error: unknown,
  properties: TelemetryProperties = {},
  options: FailCommandOptions = {},
): void {
  const errorKind = classifyError(error);
  const durationMs = Date.now() - startedAt;
  captureTelemetry(context, "command_failed", {
    command,
    duration_ms: durationMs,
    error_kind: errorKind,
    ...properties,
  });
  captureSampledException(context, {
    command,
    duration_ms: durationMs,
    error_kind: errorKind,
    ...properties,
  }, options);
}

export async function flushTelemetry(context: TelemetryContext, timeoutMs = 300): Promise<void> {
  if (!context.enabled || !context.client) return;
  try {
    await context.client.shutdown(timeoutMs);
  } catch {
    // Telemetry must never affect command behavior.
  }
}

export function sanitizeProperties(properties: TelemetryProperties): TelemetryProperties {
  const sanitized: TelemetryProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPS.has(key)) continue;
    if (value === undefined) continue;
    sanitized[key] = sanitizeValue(value);
  }
  return sanitized;
}

export function classifyError(error: unknown): TelemetryErrorKind {
  const message = redact(error instanceof Error ? error.message : String(error));
  if (message.includes("manifest invalid")) return "manifest_validation_error";
  if (message.toLowerCase().includes("lockfile")) return "lockfile_error";
  if (message.includes("HTTP ") || message.includes("fetch") || message.includes("network")) {
    return "network_fetch_error";
  }
  if (message.includes("Integrity check failed")) return "integrity_error";
  if (message.includes("settings")) return "settings_merge_error";
  if (message.includes("permission") || message.includes("EACCES") || message.includes("EPERM")) {
    return "filesystem_permission_error";
  }
  return "unknown_error";
}

function captureSampledException(
  context: TelemetryContext,
  properties: TelemetryProperties,
  options: FailCommandOptions,
): void {
  const sampleRate = clampSampleRate(options.exceptionSampleRate ?? 0.1);
  const random = options.random ?? Math.random;
  if (sampleRate <= 0 || random() >= sampleRate) return;
  captureTelemetry(context, "command_exception_sampled", properties);
}

function clampSampleRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function newPostHogClient(apiKey: string): TelemetryClient {
  return new PostHog(apiKey, {
    host: process.env["AI_SKILLS_POSTHOG_HOST"]?.trim() || DEFAULT_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    maxBatchSize: 10,
    maxQueueSize: 50,
    sendFeatureFlagEvent: false,
    preloadFeatureFlags: false,
    enableExceptionAutocapture: false,
    privacyMode: true,
  });
}

function baseProperties(): TelemetryProperties {
  return {
    cli_version: CLI_VERSION,
    node_major: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10),
    platform: process.platform,
    arch: process.arch,
  };
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter((item) =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean",
    );
  }
  return String(value);
}
