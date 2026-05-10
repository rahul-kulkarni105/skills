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
import { CLI_VERSION } from "./version.js";
import { DEFAULT_REGISTRY } from "./fetch.js";

const program = new Command();

program
  .name("ai-skills")
  .description(
    "Selective installer for AI coding-assistant skills, rules, and instructions.\n" +
      "Targets: Claude Code, GitHub Copilot, OpenAI Codex, Gemini CLI, Cursor.",
  )
  .version(CLI_VERSION, "-V, --version");

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
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    const targets = opts.target.length > 0 ? opts.target : undefined;
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
    } catch (err) {
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
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    try {
      const result = await runVerify({ installRoot });
      process.exit(result.exitCode);
    } catch (err) {
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
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    try {
      const result = await runDoctor({ installRoot });
      process.exit(result.status === "fail" ? 1 : 0);
    } catch (err) {
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
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    try {
      await runList({
        installRoot,
        json: opts.json,
        ...(opts.manifest ? { manifestPath: resolve(opts.manifest) } : {}),
        ...(opts.ref ? { ref: opts.ref } : {}),
        ...(opts.registry ? { registry: opts.registry } : {}),
        registryTrust: opts.registryTrust,
      });
    } catch (err) {
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
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    const targets = opts.target.length > 0 ? opts.target : undefined;
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
    } catch (err) {
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
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    try {
      await runRemove({
        ids,
        installRoot,
        yes: opts.yes,
        force: opts.force,
        cascade: opts.cascade,
        ...(opts.manifest ? { manifestPath: resolve(opts.manifest) } : {}),
      });
    } catch (err) {
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
    const installRoot = resolve(opts.installRoot ?? process.cwd());
    try {
      await runEject({ installRoot });
    } catch (err) {
      process.stderr.write(`ai-skills eject: ${formatError(err)}\n`);
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
