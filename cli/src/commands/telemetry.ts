import {
  decideTelemetry,
  getConfigPath,
  readConfig,
  updateTelemetryConsent,
  type AiSkillsConfig,
} from "../config.js";

export interface TelemetryCommandOptions {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  write?: (message: string) => void;
}

export async function runTelemetryStatus(options: TelemetryCommandOptions = {}): Promise<void> {
  const configPath = options.configPath ?? configPathFor(options);
  const config = await readConfig(configPath).catch(() => null);
  const decisionOptions = {
    config,
    ...(options.isTTY !== undefined ? { isTTY: options.isTTY } : {}),
    ...(options.env ? { env: options.env } : {}),
  };
  const decision = decideTelemetry(decisionOptions);
  const write = options.write ?? ((message: string) => process.stdout.write(message));
  const persisted = config?.telemetry?.consent ?? "unset";

  write(`Telemetry: ${decision.enabled ? "enabled" : "disabled"} (${decision.reason})\n`);
  write(`Persisted preference: ${persisted}\n`);
  write(`Config: ${configPath}\n`);
}

export async function runTelemetryEnable(options: TelemetryCommandOptions = {}): Promise<AiSkillsConfig> {
  const configPath = options.configPath ?? configPathFor(options);
  const config = await updateTelemetryConsent("enabled", configPath);
  const write = options.write ?? ((message: string) => process.stdout.write(message));
  write("Telemetry enabled. Anonymous usage analytics may be sent in future versions.\n");
  return config;
}

export async function runTelemetryDisable(options: TelemetryCommandOptions = {}): Promise<AiSkillsConfig> {
  const configPath = options.configPath ?? configPathFor(options);
  const config = await updateTelemetryConsent("disabled", configPath);
  const write = options.write ?? ((message: string) => process.stdout.write(message));
  write("Telemetry disabled.\n");
  return config;
}

function configPathFor(options: TelemetryCommandOptions): string {
  return getConfigPath(options.env ? { env: options.env } : {});
}
