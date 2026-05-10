#!/usr/bin/env node
/**
 * CLI entry point. Parsed by commander; run via the `ai-skills` bin.
 *
 * All heavy lifting is delegated to commands/init.ts and commands/verify.ts.
 * This file is intentionally thin — it owns argv parsing, option defaults,
 * and translating command results into process.exit codes.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runVerify } from "./commands/verify.js";
import { runDoctor } from "./commands/doctor.js";
import { runList } from "./commands/list.js";
import { runAdd } from "./commands/add.js";
import { runRemove } from "./commands/remove.js";
import { runEject } from "./commands/eject.js";
import {
  runTelemetryDisable,
  runTelemetryEnable,
  runTelemetryStatus,
} from "./commands/telemetry.js";
import { CLI_VERSION } from "./version.js";
import { DEFAULT_REGISTRY } from "./fetch.js";
import { configureLogger, logDebug } from "./log.js";
import {
  captureTelemetry,
  completeCommand,
  createTelemetryContext,
  failCommand,
  flushTelemetry,
  startCommand,
  type TelemetryContext,
  type TelemetryProperties,
} from "./telemetry.js";

const program = new Command();

program
  .name("ai-skills")
  .description(
    "Selective installer for AI coding-assistant skills, rules, and instructions.\n" +
      "Targets: Claude Code, GitHub Copilot, OpenAI Codex, Gemini CLI, Cursor.",
  )
  .version(CLI_VERSION, "-V, --version")
  .option("-q, --quiet", "Suppress diagnostic logging", false)
  .option("-v, --verbose", "Enable debug diagnostic logging", false);

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command("init")
  .description(
    "Install skills and rules into the current project.\n" +
      "With --ref: fetches from GitHub. With --manifest: installs from a local file.",
  )
  .option(
    "--manifest <path>",
    "Path to a local manifest.json (skips network fetch)",
  )
  .option(
    "--ref <ref>",
    "Git tag (v1.2.3) or 40-char commit sha to fetch from GitHub",
  )
  .option(
    "--registry <owner/repo>",
    `GitHub registry to fetch from (default: ${DEFAULT_REGISTRY})`,
  )
  .option(
    "--registry-trust",
    "Required when --registry is not the default — acknowledges you trust this registry",
    false,
  )
  .option(
    "--no-verify",
    "Skip cosign signature verification (warn-only; refused with --yes)",
  )
  .option(
    "--install-root <path>",
    "Directory to install files into (default: current directory)",
  )
  .option(
    "--target <id>",
    "Target to install for — can be repeated (default: all targets in interactive mode)",
    collect,
    [] as string[],
  )
  .option("--user", "Install into user home directory; skips project-scoped targets (Cursor, Copilot)", false)
  .option("--yes", "Non-interactive: overwrite existing files, accept all defaults", false)
  .action(async (opts: {
    manifest?: string;
    ref?: string;
    registry?: string;
    registryTrust: boolean;
    verify: boolean; // commander inverts --no-verify → opts.verify = false
    installRoot?: string;
    target: string[];
    user: boolean;
    yes: boolean;
  }) => {
    applyLoggingOptions();
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    const targets = opts.target.length > 0 ? opts.target : undefined;
    logCommandStart("init", {
      source_kind: sourceKind(opts),
      target_count: opts.target.length,
      user_mode: opts.user,
      yes_mode: opts.yes,
    });
    const telemetryProps = {
      source_kind: sourceKind(opts),
      target_count: opts.target.length,
      user_mode: opts.user,
      yes_mode: opts.yes,
      network_fetch_used: Boolean(opts.ref),
    };
    const telemetry = await beginTelemetry("init", telemetryProps);
    try {
      await runInit({
        ...(opts.manifest ? { manifestPath: resolve(opts.manifest) } : {}),
        ...(opts.ref ? { ref: opts.ref } : {}),
        ...(opts.registry ? { registry: opts.registry } : {}),
        registryTrust: opts.registryTrust,
        noVerify: !opts.verify,
        installRoot,
        yes: opts.yes,
        userMode: opts.user,
        ...(targets ? { targets } : {}),
      });
      captureTelemetry(telemetry.context, "install_completed", telemetryProps);
      await finishTelemetry(telemetry, "init", telemetryProps);
    } catch (err) {
      await failTelemetry(telemetry, "init", err, telemetryProps);
      process.stderr.write(`ai-skills init: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

// ─── verify ───────────────────────────────────────────────────────────────────

program
  .command("verify")
  .description(
    "Verify that installed files match the lockfile sha256 values.\n" +
      "Exit 0 = all ok. Exit 1 = drift detected. Exit 2 = cannot verify (missing/corrupt lockfile).",
  )
  .option(
    "--install-root <path>",
    "Directory where files were installed (default: current directory)",
  )
  .action(async (opts: { installRoot?: string }) => {
    applyLoggingOptions();
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    logCommandStart("verify");
    const telemetry = await beginTelemetry("verify");
    try {
      const result = await runVerify({ installRoot });
      const telemetryProps = {
        exit_code: result.exitCode,
        drift_count: result.files.filter((f) => f.status !== "ok").length,
      };
      captureTelemetry(telemetry.context, "verify_completed", telemetryProps);
      await finishTelemetry(telemetry, "verify", telemetryProps);
      process.exit(result.exitCode);
    } catch (err) {
      await failTelemetry(telemetry, "verify", err);
      process.stderr.write(`ai-skills verify: ${formatError(err)}\n`);
      process.exit(2);
    }
  });

// ─── doctor ───────────────────────────────────────────────────────────────────

program
  .command("doctor")
  .description(
    "Run preflight checks: Node version, write permission, network, cosign, lockfile compatibility.",
  )
  .option(
    "--install-root <path>",
    "Directory to check (default: current directory)",
  )
  .action(async (opts: { installRoot?: string }) => {
    applyLoggingOptions();
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    logCommandStart("doctor");
    const telemetry = await beginTelemetry("doctor");
    try {
      const result = await runDoctor({ installRoot });
      const telemetryProps = {
        exit_code: result.status === "fail" ? 1 : 0,
        cosign_available: result.checks.some((c) => c.name.includes("cosign") && c.status === "ok"),
      };
      captureTelemetry(telemetry.context, "doctor_check_completed", telemetryProps);
      await finishTelemetry(telemetry, "doctor", telemetryProps);
      process.exit(result.status === "fail" ? 1 : 0);
    } catch (err) {
      await failTelemetry(telemetry, "doctor", err);
      process.stderr.write(`ai-skills doctor: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

// ─── Parse ────────────────────────────────────────────────────────────────────

// ─── list ─────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description(
    "Show installed, available, and outdated components.\n" +
      "Pass --manifest or --ref to see available/outdated sections.",
  )
  .option(
    "--manifest <path>",
    "Path to a local manifest.json (enables Available + Outdated sections)",
  )
  .option(
    "--ref <ref>",
    "Git tag or 40-char commit sha to fetch manifest from GitHub",
  )
  .option(
    "--registry <owner/repo>",
    `GitHub registry to fetch from (default: ${DEFAULT_REGISTRY})`,
  )
  .option(
    "--registry-trust",
    "Required when --registry is not the default",
    false,
  )
  .option(
    "--install-root <path>",
    "Directory where files were installed (default: current directory)",
  )
  .option("--json", "Emit JSON output (schema v1)", false)
  .action(async (opts: {
    manifest?: string;
    ref?: string;
    registry?: string;
    registryTrust: boolean;
    installRoot?: string;
    json: boolean;
  }) => {
    applyLoggingOptions();
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    logCommandStart("list", {
      source_kind: sourceKind(opts),
      json: opts.json,
    });
    const telemetryProps = {
      source_kind: sourceKind(opts),
      json: opts.json,
      network_fetch_used: Boolean(opts.ref),
    };
    const telemetry = await beginTelemetry("list", telemetryProps);
    try {
      const result = await runList({
        installRoot,
        json: opts.json,
        ...(opts.manifest ? { manifestPath: resolve(opts.manifest) } : {}),
        ...(opts.ref ? { ref: opts.ref } : {}),
        ...(opts.registry ? { registry: opts.registry } : {}),
        registryTrust: opts.registryTrust,
      });
      const completedProps = {
        ...telemetryProps,
        component_count: result.installed.length + result.available.length,
        drift_count: result.outdated.length,
      };
      captureTelemetry(telemetry.context, "list_completed", completedProps);
      await finishTelemetry(telemetry, "list", completedProps);
    } catch (err) {
      await failTelemetry(telemetry, "list", err, telemetryProps);
      process.stderr.write(`ai-skills list: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

// ─── add ──────────────────────────────────────────────────────────────────────

program
  .command("add <id...>")
  .description(
    "Add specific components to an existing installation.\n" +
      "Accepts component ids, globs (e.g. 'skills.*'), or bundle ids.",
  )
  .option(
    "--manifest <path>",
    "Path to a local manifest.json (skips network fetch)",
  )
  .option(
    "--ref <ref>",
    "Git tag or 40-char commit sha to fetch from GitHub",
  )
  .option(
    "--registry <owner/repo>",
    `GitHub registry to fetch from (default: ${DEFAULT_REGISTRY})`,
  )
  .option(
    "--registry-trust",
    "Required when --registry is not the default",
    false,
  )
  .option("--no-verify", "Skip cosign signature verification")
  .option(
    "--install-root <path>",
    "Directory to install files into (default: current directory)",
  )
  .option(
    "--target <id>",
    "Target to install for — can be repeated",
    collect,
    [] as string[],
  )
  .option("--user", "Install into user home directory; skips project-scoped targets", false)
  .option("--yes", "Non-interactive: overwrite existing, accept all defaults", false)
  .option("--force", "Re-install even if already present in the lockfile", false)
  .action(async (ids: string[], opts: {
    manifest?: string;
    ref?: string;
    registry?: string;
    registryTrust: boolean;
    verify: boolean;
    installRoot?: string;
    target: string[];
    user: boolean;
    yes: boolean;
    force: boolean;
  }) => {
    applyLoggingOptions();
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    const targets = opts.target.length > 0 ? opts.target : undefined;
    logCommandStart("add", {
      source_kind: sourceKind(opts),
      id_count: ids.length,
      target_count: opts.target.length,
      user_mode: opts.user,
      yes_mode: opts.yes,
      force: opts.force,
    });
    const telemetryProps = {
      source_kind: sourceKind(opts),
      id_count: ids.length,
      target_count: opts.target.length,
      user_mode: opts.user,
      yes_mode: opts.yes,
      force: opts.force,
      network_fetch_used: Boolean(opts.ref),
    };
    const telemetry = await beginTelemetry("add", telemetryProps);
    try {
      await runAdd({
        ids,
        installRoot,
        yes: opts.yes,
        force: opts.force,
        userMode: opts.user,
        noVerify: !opts.verify,
        ...(opts.manifest ? { manifestPath: resolve(opts.manifest) } : {}),
        ...(opts.ref ? { ref: opts.ref } : {}),
        ...(opts.registry ? { registry: opts.registry } : {}),
        registryTrust: opts.registryTrust,
        ...(targets ? { targets } : {}),
      });
      captureTelemetry(telemetry.context, "add_completed", telemetryProps);
      await finishTelemetry(telemetry, "add", telemetryProps);
    } catch (err) {
      await failTelemetry(telemetry, "add", err, telemetryProps);
      process.stderr.write(`ai-skills add: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

// ─── remove ───────────────────────────────────────────────────────────────────

program
  .command("remove <id...>")
  .description(
    "Remove installed components.\n" +
      "Settings-merge entries are removed from tracking but the file is kept.",
  )
  .option(
    "--manifest <path>",
    "Path to a local manifest.json (enables orphan detection)",
  )
  .option(
    "--install-root <path>",
    "Directory where files were installed (default: current directory)",
  )
  .option("--yes", "Delete even if the on-disk file has drifted from the lockfile sha", false)
  .option("--force", "Same as --yes; also leaves dependent components in a broken state", false)
  .option("--cascade", "Also remove installed components that depend on the removed ones", false)
  .action(async (ids: string[], opts: {
    manifest?: string;
    installRoot?: string;
    yes: boolean;
    force: boolean;
    cascade: boolean;
  }) => {
    applyLoggingOptions();
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    logCommandStart("remove", {
      id_count: ids.length,
      yes_mode: opts.yes,
      force: opts.force,
      cascade: opts.cascade,
      has_manifest: Boolean(opts.manifest),
    });
    const telemetryProps = {
      id_count: ids.length,
      yes_mode: opts.yes,
      force: opts.force,
      cascade: opts.cascade,
      has_manifest: Boolean(opts.manifest),
    };
    const telemetry = await beginTelemetry("remove", telemetryProps);
    try {
      const result = await runRemove({
        ids,
        installRoot,
        yes: opts.yes,
        force: opts.force,
        cascade: opts.cascade,
        ...(opts.manifest ? { manifestPath: resolve(opts.manifest) } : {}),
      });
      const completedProps = {
        ...telemetryProps,
        removed_count: result.entries.filter((e) => e.action !== "skipped").length,
        skipped_count: result.entries.filter((e) => e.action === "skipped").length,
      };
      captureTelemetry(telemetry.context, "remove_completed", completedProps);
      await finishTelemetry(telemetry, "remove", completedProps);
    } catch (err) {
      await failTelemetry(telemetry, "remove", err, telemetryProps);
      process.stderr.write(`ai-skills remove: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

// ─── eject ────────────────────────────────────────────────────────────────────

program
  .command("eject")
  .description(
    "Stop managing files with ai-skills.\n" +
      "Shim files have their managed-by header stripped. All other files are kept.\n" +
      "The lockfile is deleted.",
  )
  .option(
    "--install-root <path>",
    "Directory where files were installed (default: current directory)",
  )
  .action(async (opts: { installRoot?: string }) => {
    applyLoggingOptions();
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    logCommandStart("eject");
    const telemetry = await beginTelemetry("eject");
    try {
      const result = await runEject({ installRoot });
      const telemetryProps = { component_count: result.entries.length };
      captureTelemetry(telemetry.context, "eject_completed", telemetryProps);
      await finishTelemetry(telemetry, "eject", telemetryProps);
    } catch (err) {
      await failTelemetry(telemetry, "eject", err);
      process.stderr.write(`ai-skills eject: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

// ─── telemetry ───────────────────────────────────────────────────────────────

const telemetry = program
  .command("telemetry")
  .description("Manage anonymous analytics preference.");

telemetry
  .command("status")
  .description("Show the current telemetry preference and effective state.")
  .action(async () => {
    applyLoggingOptions();
    logCommandStart("telemetry status");
    const telemetry = await beginTelemetry("telemetry status");
    try {
      await runTelemetryStatus({ isTTY: Boolean(process.stdout.isTTY) });
      await finishTelemetry(telemetry, "telemetry status");
    } catch (err) {
      await failTelemetry(telemetry, "telemetry status", err);
      process.stderr.write(`ai-skills telemetry status: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

telemetry
  .command("enable")
  .description("Enable anonymous usage analytics for future versions.")
  .action(async () => {
    applyLoggingOptions();
    logCommandStart("telemetry enable");
    const telemetry = await beginTelemetry("telemetry enable");
    try {
      await runTelemetryEnable();
      captureTelemetry(telemetry.context, "telemetry_consent_changed", { command: "telemetry enable" });
      await finishTelemetry(telemetry, "telemetry enable");
    } catch (err) {
      await failTelemetry(telemetry, "telemetry enable", err);
      process.stderr.write(`ai-skills telemetry enable: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

telemetry
  .command("disable")
  .description("Disable anonymous usage analytics.")
  .action(async () => {
    applyLoggingOptions();
    logCommandStart("telemetry disable");
    const telemetry = await beginTelemetry("telemetry disable");
    try {
      await runTelemetryDisable();
      captureTelemetry(telemetry.context, "telemetry_consent_changed", { command: "telemetry disable" });
      await finishTelemetry(telemetry, "telemetry disable");
    } catch (err) {
      await failTelemetry(telemetry, "telemetry disable", err);
      process.stderr.write(`ai-skills telemetry disable: ${formatError(err)}\n`);
      process.exit(1);
    }
  });

// ─── Parse (must be last) ─────────────────────────────────────────────────────

await program.parseAsync(process.argv);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function applyLoggingOptions(): void {
  const opts = program.opts<{ quiet: boolean; verbose: boolean }>();
  configureLogger({ quiet: opts.quiet, verbose: opts.verbose });
}

function logCommandStart(command: string, fields: Record<string, unknown> = {}): void {
  logDebug("command started", { command, ...fields });
}

function sourceKind(opts: { manifest?: string; ref?: string }): "local_manifest" | "github_ref" | "none" {
  if (opts.manifest) return "local_manifest";
  if (opts.ref) return "github_ref";
  return "none";
}

interface ActiveTelemetry {
  context: TelemetryContext;
  startedAt: number;
}

async function beginTelemetry(command: string, properties: TelemetryProperties = {}): Promise<ActiveTelemetry> {
  const context = await createTelemetryContext({ isTTY: Boolean(process.stdout.isTTY) });
  const startedAt = startCommand(context, command, properties);
  return { context, startedAt };
}

async function finishTelemetry(
  telemetry: ActiveTelemetry,
  command: string,
  properties: TelemetryProperties = {},
): Promise<void> {
  completeCommand(telemetry.context, command, telemetry.startedAt, properties);
  await flushTelemetry(telemetry.context);
}

async function failTelemetry(
  telemetry: ActiveTelemetry,
  command: string,
  err: unknown,
  properties: TelemetryProperties = {},
): Promise<void> {
  failCommand(telemetry.context, command, telemetry.startedAt, err, properties);
  await flushTelemetry(telemetry.context);
}
