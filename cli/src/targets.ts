/**
 * Runtime target registry.
 *
 * This augments the manifest's `targets` array with CLI-side metadata that
 * isn't part of the published schema: shim format and the --user-mode guard.
 *
 * Decision (resolved 2026-05-09): Cursor and Copilot use `inline-shim` format
 * because Cursor's `@file` directive does not resolve paths outside `.cursor/`
 * and Copilot's import syntax is project-scoped. All other targets copy the
 * canonical file verbatim.
 */

import { type ComponentType } from "./manifest-schema.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShimFormat = "copy" | "inline-shim" | "none";

export interface TargetDef {
  id: string;
  /** How files are delivered for this target. */
  shimFormat: ShimFormat;
  /** Component types this target installs. Stack types are excluded in v1. */
  supportedTypes: ReadonlySet<ComponentType>;
  /**
   * When true this target is silently skipped in `--user` mode with a warning.
   * Cursor and Copilot write into project-level directories; they don't have
   * a user-global install location.
   */
  disabledInUserMode: boolean;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const ENTRIES: TargetDef[] = [
  {
    id: "claude",
    shimFormat: "copy",
    supportedTypes: new Set(["skill", "rule", "instruction", "settings"]),
    disabledInUserMode: false,
  },
  {
    id: "cursor",
    shimFormat: "inline-shim",
    supportedTypes: new Set(["skill", "rule", "instruction"]),
    disabledInUserMode: true,
  },
  {
    id: "copilot",
    shimFormat: "inline-shim",
    supportedTypes: new Set(["rule", "instruction"]),
    disabledInUserMode: true,
  },
  {
    id: "gemini",
    shimFormat: "copy",
    supportedTypes: new Set(["rule", "instruction"]),
    disabledInUserMode: false,
  },
  {
    id: "codex",
    shimFormat: "copy",
    supportedTypes: new Set(["rule", "instruction"]),
    disabledInUserMode: false,
  },
];

export const TARGET_REGISTRY: ReadonlyMap<string, TargetDef> = new Map(
  ENTRIES.map((t) => [t.id, t]),
);

/**
 * Look up a target by id. Returns undefined for unknown ids (the manifest
 * validator has already confirmed the target exists in the manifest; unknown
 * ids here just mean the CLI doesn't have runtime metadata for them yet).
 */
export function getTargetDef(id: string): TargetDef | undefined {
  return TARGET_REGISTRY.get(id);
}
