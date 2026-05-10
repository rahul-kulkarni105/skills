/**
 * Build manifest.json from the repo state.
 *
 * Run via `npm run build:manifest` (tsx). Writes to <repo-root>/manifest.json.
 *
 * Determinism guarantees:
 *   - Components, targets, bundles, shimTemplates are emitted in stable
 *     id-sorted order.
 *   - Object keys are emitted in a fixed order (see `stableStringify`).
 *   - Arrays whose order is not load-bearing (`bundles`, `dependsOn`,
 *     installs target keys) are sorted.
 *   - Two clean checkouts at the same commit produce a byte-identical file.
 *
 * The release block is filled from environment when present:
 *   AI_SKILLS_RELEASE_TAG, AI_SKILLS_RELEASE_COMMIT, AI_SKILLS_RELEASE_BUILT_AT.
 * Otherwise the script reads HEAD via `git rev-parse` and uses tag "dev"
 * with builtAt = a fixed sentinel so local rebuilds stay deterministic.
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSha256 } from "../src/sha.js";
import {
  type Bundle,
  type Component,
  type InstallSpec,
  type Manifest,
  MANIFEST_VERSION,
  type ShimTemplate,
  type Target,
  validateManifest,
} from "../src/manifest-schema.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

// Top-level files/dirs the manifest never touches. Anything not in an
// allowlisted source dir below is implicitly skipped — this list exists
// so that the explicit-skip intent is documented, not so the walker
// scans the whole tree.
const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  ".git",
  ".github",
  ".vscode",
  ".cursor",
  "node_modules",
  "cli",
  "bootstrap",
  "docs",
  "prompts",
]);
const EXCLUDED_TOP_FILES: ReadonlySet<string> = new Set([
  "IMPLEMENTATION_PLAN.md",
  "manifest.json",
  "manifest.sig",
  ".ai-skills.lock.json",
  ".gitignore",
  ".gitattributes",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
]);

const TARGETS: Target[] = [
  { id: "claude", label: "Claude Code", installRoot: ".", projectScoped: true },
  { id: "cursor", label: "Cursor", installRoot: ".", projectScoped: true },
  { id: "copilot", label: "GitHub Copilot", installRoot: ".", projectScoped: true },
  { id: "gemini", label: "Gemini CLI", installRoot: ".", projectScoped: true },
  { id: "codex", label: "OpenAI Codex", installRoot: ".", projectScoped: true },
];

const SHIM_TEMPLATES_SOURCE: Array<{ id: string; body: string; managedByHeader: string }> = [
  {
    id: "cursor-file-shim",
    managedByHeader: "# managed-by: ai-skills",
    // Template body is the header block (without version/source placeholders).
    // The sha of this body is recorded in the manifest; bumping it triggers
    // a re-render of every shim that uses this template on the next upgrade.
    body: "# managed-by: ai-skills@{{version}} — do not edit; regenerated on upgrade\n# source: {{source}}\n",
  },
  {
    id: "copilot-import-shim",
    managedByHeader: "<!-- managed-by: ai-skills -->",
    body: "<!-- managed-by: ai-skills@{{version}} — do not edit; regenerated on upgrade -->\n<!-- source: {{source}} -->\n",
  },
];

interface ComponentSeed {
  id: string;
  type: Component["type"];
  source: string;
  description?: string;
  bundles?: string[];
  dependsOn?: string[];
  mergeStrategy?: Component["mergeStrategy"];
  installs: Record<string, InstallSpec>;
}

function buildSeeds(): ComponentSeed[] {
  const seeds: ComponentSeed[] = [];

  // Rules at repo root.
  seeds.push({
    id: "rule.agents",
    type: "rule",
    source: "AGENTS.md",
    description: "Universal cross-tool rules.",
    bundles: ["rules-core"],
    installs: {
      claude: { dest: "AGENTS.md" },
      cursor: { dest: ".cursor/rules/000-agents.mdc", shim: "cursor-file-shim" },
      copilot: { dest: ".github/copilot-instructions.md", shim: "copilot-import-shim" },
      gemini: { dest: "AGENTS.md" },
      codex: { dest: "AGENTS.md" },
    },
  });
  seeds.push({
    id: "rule.claude",
    type: "rule",
    source: "CLAUDE.md",
    description: "Claude Code project memory. Depends on rule.agents.",
    bundles: ["rules-core"],
    dependsOn: ["rule.agents"],
    installs: {
      claude: { dest: "CLAUDE.md" },
    },
  });
  seeds.push({
    id: "rule.gemini",
    type: "rule",
    source: "GEMINI.md",
    description: "Gemini CLI project memory.",
    bundles: ["rules-core"],
    installs: {
      gemini: { dest: "GEMINI.md" },
    },
  });

  // Skills.
  for (const skillDir of listDirs(join(REPO_ROOT, "skills"))) {
    if (skillDir === "_template") continue;
    const sourcePath = `skills/${skillDir}/SKILL.md`;
    if (!fileExists(join(REPO_ROOT, sourcePath))) continue;
    seeds.push({
      id: `skill.${skillDir}`,
      type: "skill",
      source: sourcePath,
      bundles: ["adversarial-pack"],
      installs: {
        claude: { dest: `.claude/skills/${skillDir}/SKILL.md` },
        cursor: {
          dest: `.cursor/rules/100-skill-${skillDir}.mdc`,
          shim: "cursor-file-shim",
        },
      },
    });
  }

  // Top-level instructions (excluding the per-tool overlays in context/).
  for (const file of listFiles(join(REPO_ROOT, "instructions"))) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const id = `instruction.${file.replace(/\.md$/, "")}`;
    const source = `instructions/${file}`;
    seeds.push({
      id,
      type: "instruction",
      source,
      installs: {
        claude: { dest: source },
      },
    });
  }

  // Per-tool instruction overlays.
  for (const file of listFiles(join(REPO_ROOT, "instructions", "context"))) {
    if (!file.endsWith(".md")) continue;
    const tool = file.replace(/\.md$/, "");
    const source = `instructions/context/${file}`;
    const targetId = mapContextFileToTarget(tool);
    if (!targetId) continue;
    seeds.push({
      id: `instruction.context.${tool}`,
      type: "instruction",
      source,
      installs: {
        [targetId]: { dest: source },
      },
    });
  }

  // Settings.
  if (fileExists(join(REPO_ROOT, ".claude", "settings.json"))) {
    seeds.push({
      id: "settings.claude",
      type: "settings",
      source: ".claude/settings.json",
      mergeStrategy: "deep-merge",
      installs: {
        claude: { dest: ".claude/settings.json" },
      },
    });
  }

  return seeds;
}

function mapContextFileToTarget(tool: string): string | undefined {
  switch (tool) {
    case "claude":
      return "claude";
    case "cursor":
      return "cursor";
    case "copilot":
      return "copilot";
    case "gemini":
      return "gemini";
    case "codex":
      return "codex";
    case "windsurf":
      return undefined;
    default:
      return undefined;
  }
}

function listDirs(absPath: string): string[] {
  if (!dirExists(absPath)) return [];
  return readdirSync(absPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function listFiles(absPath: string): string[] {
  if (!dirExists(absPath)) return [];
  return readdirSync(absPath, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
}

function dirExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function buildBundles(seeds: ComponentSeed[]): Bundle[] {
  const map = new Map<string, string[]>();
  for (const seed of seeds) {
    for (const bundleId of seed.bundles ?? []) {
      const list = map.get(bundleId) ?? [];
      list.push(seed.id);
      map.set(bundleId, list);
    }
  }
  const labels: Record<string, { label: string; description: string }> = {
    "rules-core": {
      label: "Core rules",
      description: "Cross-tool agent rules (AGENTS.md, CLAUDE.md, GEMINI.md).",
    },
    "adversarial-pack": {
      label: "Adversarial review pack",
      description: "Skills for grilling plans, surfacing weak spots, steelmanning.",
    },
  };
  const bundles: Bundle[] = [];
  for (const [id, components] of [...map.entries()].sort(byKey)) {
    const meta = labels[id] ?? { label: id, description: "" };
    bundles.push({
      id,
      label: meta.label,
      description: meta.description,
      components: [...components].sort(),
    });
  }
  return bundles;
}

function byKey<T extends [string, unknown]>(a: T, b: T): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

function buildShimTemplates(): ShimTemplate[] {
  return SHIM_TEMPLATES_SOURCE.map((t) => ({
    id: t.id,
    sha256: canonicalSha256(t.body),
    managedByHeader: t.managedByHeader,
  })).sort((a, b) => (a.id < b.id ? -1 : 1));
}

function readReleaseInfo(): { tag: string; commit: string; builtAt: string } {
  const tag = process.env["AI_SKILLS_RELEASE_TAG"]?.trim() || "dev";
  let commit = process.env["AI_SKILLS_RELEASE_COMMIT"]?.trim();
  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", { cwd: REPO_ROOT })
        .toString()
        .trim();
    } catch {
      // Detached / non-git case: zeros are a 40-hex placeholder.
      commit = "0".repeat(40);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    commit = commit.toLowerCase();
  }
  // Fixed sentinel for local rebuilds; CI sets the env var to the release time.
  const builtAt = process.env["AI_SKILLS_RELEASE_BUILT_AT"]?.trim() || "1970-01-01T00:00:00Z";
  return { tag, commit, builtAt };
}

function buildComponents(seeds: ComponentSeed[]): Component[] {
  const components: Component[] = [];
  for (const seed of seeds) {
    const absSource = join(REPO_ROOT, seed.source);
    if (!fileExists(absSource)) {
      throw new Error(`source file missing for component "${seed.id}": ${seed.source}`);
    }
    const sha = canonicalSha256(readFileSync(absSource));
    const installs: Record<string, InstallSpec> = {};
    for (const targetId of [...Object.keys(seed.installs)].sort()) {
      const spec = seed.installs[targetId];
      if (!spec) continue;
      installs[targetId] = spec.shim
        ? { dest: spec.dest, shim: spec.shim }
        : { dest: spec.dest };
    }
    const c: Component = {
      id: seed.id,
      type: seed.type,
      source: posix.normalize(seed.source.split(sep).join("/")),
      sha256: sha,
      installs,
    };
    if (seed.dependsOn?.length) c.dependsOn = [...seed.dependsOn].sort();
    if (seed.mergeStrategy) c.mergeStrategy = seed.mergeStrategy;
    if (seed.description) c.description = seed.description;
    if (seed.bundles?.length) c.bundles = [...seed.bundles].sort();
    components.push(c);
  }
  components.sort((a, b) => (a.id < b.id ? -1 : 1));
  return components;
}

function buildManifest(): Manifest {
  const seeds = buildSeeds();
  const components = buildComponents(seeds);
  const bundles = buildBundles(seeds);
  const targets = [...TARGETS].sort((a, b) => (a.id < b.id ? -1 : 1));
  const shimTemplates = buildShimTemplates();
  const release = readReleaseInfo();

  const manifest: Manifest = {
    manifestVersion: MANIFEST_VERSION,
    release,
    targets,
    shimTemplates,
    components,
    bundles,
  };
  validateManifest(manifest);
  return manifest;
}

/**
 * Stable JSON.stringify with a fixed top-level key order so that two
 * builds at the same input produce byte-identical output. Object key
 * order inside nested values follows insertion order (which we
 * already control above).
 */
function stableStringify(m: Manifest): string {
  const ordered = {
    manifestVersion: m.manifestVersion,
    release: m.release,
    targets: m.targets,
    shimTemplates: m.shimTemplates,
    bundles: m.bundles,
    components: m.components,
  };
  return JSON.stringify(ordered, null, 2) + "\n";
}

function main(): void {
  const manifest = buildManifest();
  const out = stableStringify(manifest);
  const outPath = join(REPO_ROOT, "manifest.json");
  writeFileSync(outPath, out, "utf8");
  // Sanity log so CI knows what was written.
  const rel = relative(process.cwd(), outPath) || outPath;
  process.stdout.write(`wrote ${rel} (${manifest.components.length} components, release=${manifest.release.tag}@${manifest.release.commit.slice(0, 8)})\n`);
}

// Reference unused imports so tsc doesn't strip them in unusual configurations.
void EXCLUDED_DIRS;
void EXCLUDED_TOP_FILES;

main();
