/**
 * Thin wrappers around `@inquirer/prompts` used by the `init` command.
 *
 * Keeping all interactive UI in one place:
 *   1. Makes it easy to find and adjust copy/UX without touching command logic.
 *   2. Lets tests bypass this layer entirely by passing an `onExistingFile`
 *      callback into `runInit` (see commands/init.ts).
 */

import { checkbox, confirm, select } from "@inquirer/prompts";
import { type Component, type Target } from "./manifest-schema.js";

// ─── Target selection ─────────────────────────────────────────────────────────

/**
 * Multi-select picker for install targets.
 * Returns the ids of the targets the user selected.
 * Always returns at least one (the prompt re-prompts on empty selection).
 */
export async function promptTargetSelect(targets: ReadonlyArray<Target>): Promise<string[]> {
  const choices = targets.map((t) => ({
    name: t.label,
    value: t.id,
    checked: false,
  }));

  let selected: string[] = [];
  while (selected.length === 0) {
    selected = await checkbox({
      message: "Which tools do you want to install for?",
      choices,
    });
    if (selected.length === 0) {
      process.stdout.write("Please select at least one target.\n");
    }
  }
  return selected;
}

// ─── Component / bundle selection ─────────────────────────────────────────────

export type ComponentPickMode = "bundle" | "individual";

/**
 * Ask the user whether they want to install a bundle or pick individually.
 */
export async function promptPickMode(): Promise<ComponentPickMode> {
  return select<ComponentPickMode>({
    message: "How do you want to select components?",
    choices: [
      { name: "Install a bundle (curated set)", value: "bundle" },
      { name: "Pick components individually", value: "individual" },
    ],
  });
}

/**
 * Multi-select for individual components.
 */
export async function promptComponentSelect(
  components: ReadonlyArray<Component>,
): Promise<string[]> {
  const choices = components.map((c) => ({
    name: `${c.id}${c.description ? `  — ${c.description}` : ""}`,
    value: c.id,
    checked: false,
  }));

  let selected: string[] = [];
  while (selected.length === 0) {
    selected = await checkbox({
      message: "Select components to install:",
      choices,
    });
    if (selected.length === 0) {
      process.stdout.write("Please select at least one component.\n");
    }
  }
  return selected;
}

// ─── Adopt-or-overwrite ───────────────────────────────────────────────────────

export type ExistingFileChoice = "adopt" | "overwrite" | "skip";

/**
 * When a managed dest already exists on disk, ask the user what to do.
 *
 *   adopt     — record the file as managed without overwriting it (sha of
 *               current disk content stored in lockfile).
 *   overwrite — replace the existing file with the canonical version.
 *   skip      — leave the file alone and don't track it in the lockfile.
 */
export async function promptAdoptOrOverwrite(dest: string): Promise<ExistingFileChoice> {
  return select<ExistingFileChoice>({
    message: `File already exists: ${dest}. What should ai-skills do?`,
    choices: [
      {
        name: "Adopt  (keep current content, start tracking it)",
        value: "adopt",
      },
      {
        name: "Overwrite  (replace with the canonical version)",
        value: "overwrite",
      },
      {
        name: "Skip  (leave it alone, don't track it)",
        value: "skip",
      },
    ],
  });
}

// ─── Generic confirm ──────────────────────────────────────────────────────────

export async function promptConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}
