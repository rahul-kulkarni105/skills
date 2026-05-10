/**
 * Manifest types + a hand-written validator. No zod — the surface is small
 * enough that a dependency isn't worth it.
 *
 * Validation guarantees (every one is exercised by manifest-schema.test.ts):
 *   - All required fields present and correctly typed.
 *   - Every sha256 is exactly 64 lowercase hex.
 *   - No `dest` contains `..`, is absolute, or normalizes outside its
 *     install root.
 *   - Destinations within a target are unique even under
 *     case-insensitive comparison (macOS/Windows trap).
 *   - `dependsOn` ids exist and form a DAG (no cycles).
 *
 * `type: "stack"` is reserved here for future use; v1 has no install logic
 * for stacks but the schema accepts the type so a future manifest doesn't
 * require a major bump.
 */

export const MANIFEST_VERSION = 1;
export const LOCKFILE_SCHEMA_VERSION = 1;

export type ComponentType =
  | "skill"
  | "rule"
  | "instruction"
  | "settings"
  | "stack";

export type MergeStrategy = "deep-merge" | "replace";

export interface InstallSpec {
  /** Path relative to the install root. Forward slashes. No `..`, no absolute. */
  dest: string;
  /** Optional shim template id (from `shimTemplates`). When set, this target gets a generated shim instead of the canonical file. */
  shim?: string;
}

export interface Component {
  id: string;
  type: ComponentType;
  /** Repo-relative source path. Forward slashes. */
  source: string;
  sha256: string;
  installs: Record<string, InstallSpec>;
  dependsOn?: string[];
  mergeStrategy?: MergeStrategy;
  description?: string;
  bundles?: string[];
}

export interface Target {
  id: string;
  label: string;
  /** Default install root relative to the user's project (or `~/.claude`). */
  installRoot: string;
  /** True if this target is project-scoped (disabled in `--user` mode). */
  projectScoped: boolean;
}

export interface ShimTemplate {
  id: string;
  /** Hash of the template body (LF-normalized). Bump → re-render on upgrade. */
  sha256: string;
  /** Forward-slash header marker recorded in the rendered file. */
  managedByHeader: string;
}

export interface Bundle {
  id: string;
  label: string;
  description: string;
  components: string[];
}

export interface Release {
  tag: string;
  /** 40-char lowercase hex commit sha. */
  commit: string;
  /** ISO 8601 UTC. */
  builtAt: string;
}

export interface Manifest {
  manifestVersion: number;
  release: Release;
  targets: Target[];
  shimTemplates: ShimTemplate[];
  components: Component[];
  bundles: Bundle[];
  /** Old id → new id, applied in memory by the upgrader. */
  aliases?: Record<string, string>;
}

export class ManifestValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`manifest invalid at ${path}: ${message}`);
    this.name = "ManifestValidationError";
  }
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const ID_RE = /^[a-z][a-z0-9._-]*$/;
const DEST_RE = /^[A-Za-z0-9_./-]+$/;
const COMPONENT_TYPES: ReadonlySet<ComponentType> = new Set([
  "skill",
  "rule",
  "instruction",
  "settings",
  "stack",
]);

export function validateManifest(raw: unknown): asserts raw is Manifest {
  const m = expectObject(raw, "$");

  const version = m["manifestVersion"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ManifestValidationError("$.manifestVersion", "must be a positive integer");
  }

  validateRelease(m["release"]);
  const targets = validateTargets(m["targets"]);
  const shimTemplateIds = validateShimTemplates(m["shimTemplates"]);
  const componentIds = validateComponents(m["components"], targets, shimTemplateIds);
  validateBundles(m["bundles"], componentIds);
  validateAliases(m["aliases"], componentIds);
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ManifestValidationError(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ManifestValidationError(path, "must be an array");
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ManifestValidationError(path, "must be a non-empty string");
  }
  return value;
}

function validateRelease(raw: unknown): void {
  const r = expectObject(raw, "$.release");
  expectString(r["tag"], "$.release.tag");
  const commit = expectString(r["commit"], "$.release.commit");
  if (!COMMIT_RE.test(commit)) {
    throw new ManifestValidationError("$.release.commit", "must be 40 lowercase hex chars");
  }
  const builtAt = expectString(r["builtAt"], "$.release.builtAt");
  if (Number.isNaN(Date.parse(builtAt))) {
    throw new ManifestValidationError("$.release.builtAt", "must be an ISO 8601 timestamp");
  }
}

function validateTargets(raw: unknown): Set<string> {
  const arr = expectArray(raw, "$.targets");
  if (arr.length === 0) {
    throw new ManifestValidationError("$.targets", "must contain at least one target");
  }
  const ids = new Set<string>();
  arr.forEach((t, i) => {
    const path = `$.targets[${i}]`;
    const obj = expectObject(t, path);
    const id = expectString(obj["id"], `${path}.id`);
    if (!ID_RE.test(id)) {
      throw new ManifestValidationError(`${path}.id`, "id must match /^[a-z][a-z0-9._-]*$/");
    }
    if (ids.has(id)) {
      throw new ManifestValidationError(`${path}.id`, `duplicate target id "${id}"`);
    }
    ids.add(id);
    expectString(obj["label"], `${path}.label`);
    const root = expectString(obj["installRoot"], `${path}.installRoot`);
    if (root.includes("..")) {
      throw new ManifestValidationError(`${path}.installRoot`, "must not contain '..'");
    }
    if (typeof obj["projectScoped"] !== "boolean") {
      throw new ManifestValidationError(`${path}.projectScoped`, "must be boolean");
    }
  });
  return ids;
}

function validateShimTemplates(raw: unknown): Set<string> {
  if (raw === undefined) return new Set();
  const arr = expectArray(raw, "$.shimTemplates");
  const ids = new Set<string>();
  arr.forEach((t, i) => {
    const path = `$.shimTemplates[${i}]`;
    const obj = expectObject(t, path);
    const id = expectString(obj["id"], `${path}.id`);
    if (ids.has(id)) {
      throw new ManifestValidationError(`${path}.id`, `duplicate shim template id "${id}"`);
    }
    ids.add(id);
    const sha = expectString(obj["sha256"], `${path}.sha256`);
    if (!SHA256_RE.test(sha)) {
      throw new ManifestValidationError(`${path}.sha256`, "must be 64 lowercase hex chars");
    }
    expectString(obj["managedByHeader"], `${path}.managedByHeader`);
  });
  return ids;
}

function validateComponents(
  raw: unknown,
  targetIds: Set<string>,
  shimTemplateIds: Set<string>,
): Set<string> {
  const arr = expectArray(raw, "$.components");
  const ids = new Set<string>();
  const idToDeps = new Map<string, string[]>();

  // Per-target case-insensitive destination map for collision detection.
  const destsPerTarget = new Map<string, Map<string, string>>();

  arr.forEach((c, i) => {
    const path = `$.components[${i}]`;
    const obj = expectObject(c, path);
    const id = expectString(obj["id"], `${path}.id`);
    if (!ID_RE.test(id)) {
      throw new ManifestValidationError(`${path}.id`, "id must match /^[a-z][a-z0-9._-]*$/");
    }
    if (ids.has(id)) {
      throw new ManifestValidationError(`${path}.id`, `duplicate component id "${id}"`);
    }
    ids.add(id);

    const type = expectString(obj["type"], `${path}.type`);
    if (!COMPONENT_TYPES.has(type as ComponentType)) {
      throw new ManifestValidationError(`${path}.type`, `unknown component type "${type}"`);
    }

    const source = expectString(obj["source"], `${path}.source`);
    if (source.startsWith("/") || source.includes("..")) {
      throw new ManifestValidationError(`${path}.source`, "must be repo-relative without '..'");
    }

    const sha = expectString(obj["sha256"], `${path}.sha256`);
    if (!SHA256_RE.test(sha)) {
      throw new ManifestValidationError(`${path}.sha256`, "must be 64 lowercase hex chars");
    }

    const installs = expectObject(obj["installs"], `${path}.installs`);
    const installKeys = Object.keys(installs);
    if (installKeys.length === 0) {
      throw new ManifestValidationError(`${path}.installs`, "must declare at least one target");
    }
    for (const targetId of installKeys) {
      const installPath = `${path}.installs.${targetId}`;
      if (!targetIds.has(targetId)) {
        throw new ManifestValidationError(installPath, `unknown target "${targetId}"`);
      }
      const spec = expectObject(installs[targetId], installPath);
      const dest = expectString(spec["dest"], `${installPath}.dest`);
      validateDest(dest, `${installPath}.dest`);

      let perTarget = destsPerTarget.get(targetId);
      if (!perTarget) {
        perTarget = new Map();
        destsPerTarget.set(targetId, perTarget);
      }
      const lower = dest.toLowerCase();
      const existing = perTarget.get(lower);
      if (existing !== undefined && existing !== id) {
        throw new ManifestValidationError(
          `${installPath}.dest`,
          `dest "${dest}" collides (case-insensitive) with component "${existing}" on target "${targetId}"`,
        );
      }
      perTarget.set(lower, id);

      if (spec["shim"] !== undefined) {
        const shimId = expectString(spec["shim"], `${installPath}.shim`);
        if (!shimTemplateIds.has(shimId)) {
          throw new ManifestValidationError(`${installPath}.shim`, `unknown shim template "${shimId}"`);
        }
      }
    }

    const deps = obj["dependsOn"];
    if (deps !== undefined) {
      const depArr = expectArray(deps, `${path}.dependsOn`);
      const depList: string[] = [];
      depArr.forEach((d, j) => {
        const depPath = `${path}.dependsOn[${j}]`;
        const dep = expectString(d, depPath);
        depList.push(dep);
      });
      idToDeps.set(id, depList);
    }

    if (obj["mergeStrategy"] !== undefined) {
      const ms = expectString(obj["mergeStrategy"], `${path}.mergeStrategy`);
      if (ms !== "deep-merge" && ms !== "replace") {
        throw new ManifestValidationError(`${path}.mergeStrategy`, `unknown strategy "${ms}"`);
      }
    }
  });

  for (const [id, deps] of idToDeps) {
    for (const dep of deps) {
      if (!ids.has(dep)) {
        throw new ManifestValidationError(
          `$.components[${id}].dependsOn`,
          `dependency "${dep}" not found`,
        );
      }
    }
  }
  detectCycles(idToDeps);

  return ids;
}

function detectCycles(idToDeps: Map<string, string[]>): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of idToDeps.keys()) color.set(id, WHITE);

  function visit(id: string, stack: string[]): void {
    color.set(id, GRAY);
    const deps = idToDeps.get(id) ?? [];
    for (const dep of deps) {
      const c = color.get(dep);
      if (c === GRAY) {
        throw new ManifestValidationError(
          "$.components.dependsOn",
          `dependency cycle: ${[...stack, id, dep].join(" -> ")}`,
        );
      }
      if (c === undefined || c === WHITE) {
        if (idToDeps.has(dep)) visit(dep, [...stack, id]);
      }
    }
    color.set(id, BLACK);
  }

  for (const id of idToDeps.keys()) {
    if (color.get(id) === WHITE) visit(id, []);
  }
}

function validateDest(dest: string, path: string): void {
  if (dest.length === 0) {
    throw new ManifestValidationError(path, "dest must be non-empty");
  }
  if (dest.startsWith("/") || /^[A-Za-z]:/.test(dest)) {
    throw new ManifestValidationError(path, "dest must not be absolute");
  }
  if (!DEST_RE.test(dest)) {
    throw new ManifestValidationError(
      path,
      "dest may only contain [A-Za-z0-9_./-] (forward slashes only, no spaces)",
    );
  }
  const segments = dest.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new ManifestValidationError(path, `invalid path segment "${seg}"`);
    }
  }
}

function validateBundles(raw: unknown, componentIds: Set<string>): void {
  if (raw === undefined) return;
  const arr = expectArray(raw, "$.bundles");
  const ids = new Set<string>();
  arr.forEach((b, i) => {
    const path = `$.bundles[${i}]`;
    const obj = expectObject(b, path);
    const id = expectString(obj["id"], `${path}.id`);
    if (ids.has(id)) {
      throw new ManifestValidationError(`${path}.id`, `duplicate bundle id "${id}"`);
    }
    ids.add(id);
    expectString(obj["label"], `${path}.label`);
    expectString(obj["description"], `${path}.description`);
    const components = expectArray(obj["components"], `${path}.components`);
    components.forEach((c, j) => {
      const cid = expectString(c, `${path}.components[${j}]`);
      if (!componentIds.has(cid)) {
        throw new ManifestValidationError(
          `${path}.components[${j}]`,
          `unknown component id "${cid}"`,
        );
      }
    });
  });
}

function validateAliases(raw: unknown, componentIds: Set<string>): void {
  if (raw === undefined) return;
  const obj = expectObject(raw, "$.aliases");
  for (const [oldId, newId] of Object.entries(obj)) {
    if (typeof newId !== "string" || newId.length === 0) {
      throw new ManifestValidationError(`$.aliases["${oldId}"]`, "alias target must be a non-empty string");
    }
    if (!componentIds.has(newId)) {
      throw new ManifestValidationError(
        `$.aliases["${oldId}"]`,
        `alias target "${newId}" is not a current component`,
      );
    }
    if (componentIds.has(oldId)) {
      throw new ManifestValidationError(
        `$.aliases["${oldId}"]`,
        `alias source "${oldId}" still exists as a current component`,
      );
    }
  }
}
