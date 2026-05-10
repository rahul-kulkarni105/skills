/**
 * Settings deep-merge for `mergeStrategy: "deep-merge"` components.
 *
 * Purpose: safely merge an upstream `.claude/settings.json` into an
 * existing user-controlled settings file, without silently overwriting
 * user-set values.
 *
 * Security policy (per the approved plan):
 *   - `permissions.allow` and `permissions.ask` arrays: union silently.
 *     Upstream items are added; user items are preserved. No prompts.
 *   - `permissions.deny` array: upstream additions ALWAYS prompt the user.
 *     A `deny` rule limits what the AI agent can do — the user must
 *     consciously accept any new restriction.
 *   - Other scalar conflicts (e.g. `outputStyle`): prompt at the JSON path.
 *   - Objects are merged recursively by the same rules.
 *   - Arrays that are not `allow`/`ask`/`deny` are replaced by the upstream
 *     value after prompting (no semantic union — order/dedup is unknown).
 *
 * Lockfile representation for settings-merge entries:
 *   kind: "settings-merge"
 *   installSha: sha256 of the *upstream contribution only*, normalized to
 *               the JSON projection that ai-skills controls. This lets
 *               `verify` detect when upstream content has drifted from the
 *               live file without falsely flagging user-only changes.
 *   userKeys: JSON-pointer list of paths whose values came from the user
 *             (i.e. were already present and conflict-resolved in the user's
 *             favour, or are entirely user-invented).
 *
 * The sha is computed with `canonicalSha256(stableStringify(projection))`
 * where `projection` is the subset of the merged file contributed by
 * upstream.
 */

import { canonicalSha256 } from "./sha.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/** Outcome of merging a settings file. */
export interface MergeResult {
  /** The merged JSON object to write to disk. */
  merged: JsonObject;
  /**
   * sha256 of the stable-serialised upstream projection (the part ai-skills
   * contributed). Stored as `sha256` in the lockfile entry so `verify` can
   * re-project and compare.
   */
  upstreamProjectionSha: string;
  /**
   * JSON-pointer paths (e.g. `"/outputStyle"`, `"/permissions/allow/0"`)
   * that were present in the existing file and kept as-is (user-controlled).
   * Stored as `userKeys` in the lockfile.
   */
  userKeys: string[];
}

/**
 * Callback invoked when a `permissions.deny` addition needs explicit approval.
 * Return true to accept the new deny rule, false to skip it.
 */
export type DenyPromptFn = (rule: string) => Promise<boolean>;

/**
 * Callback invoked when a scalar conflict is detected at a JSON path.
 * Return "upstream" to take the upstream value, "user" to keep the existing.
 */
export type ConflictPromptFn = (
  jsonPointer: string,
  upstreamValue: JsonValue,
  userValue: JsonValue,
) => Promise<"upstream" | "user">;

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Merge `upstream` settings into `existing` settings.
 *
 * When `existing` is null (bootstrap case: no pre-existing file), the result
 * is simply `upstream` verbatim — no prompts, `userKeys` is empty.
 *
 * @param upstream  The settings object from the manifest source file.
 * @param existing  The settings object currently on disk, or null.
 * @param onDeny    Called for each new `permissions.deny` entry. Must return
 *                  true to include the rule. Defaults to auto-accept (for
 *                  `--yes` / non-interactive mode).
 * @param onConflict Called for each scalar path conflict. Defaults to taking
 *                   the upstream value (for `--yes` / non-interactive mode).
 */
export async function mergeSettings(
  upstream: JsonObject,
  existing: JsonObject | null,
  onDeny: DenyPromptFn = async () => true,
  onConflict: ConflictPromptFn = async () => "upstream",
): Promise<MergeResult> {
  if (existing === null) {
    // Bootstrap case: no pre-existing file.
    return {
      merged: deepClone(upstream),
      upstreamProjectionSha: projectionSha(upstream),
      userKeys: [],
    };
  }

  const userKeys: string[] = [];
  const upstreamProjection: JsonObject = {};

  const merged = await mergeObjects(
    upstream,
    existing,
    upstreamProjection,
    userKeys,
    "",
    onDeny,
    onConflict,
  );

  // Fold in any user-only top-level keys not in upstream.
  for (const key of Object.keys(existing)) {
    if (!(key in upstream)) {
      (merged as JsonObject)[key] = deepClone((existing as JsonObject)[key]!);
      userKeys.push(`/${key}`);
    }
  }

  return {
    merged,
    upstreamProjectionSha: projectionSha(upstreamProjection),
    userKeys: [...new Set(userKeys)].sort(),
  };
}

// ─── Recursive merge ──────────────────────────────────────────────────────────

async function mergeObjects(
  upstream: JsonObject,
  existing: JsonObject,
  projection: JsonObject,
  userKeys: string[],
  pointer: string,
  onDeny: DenyPromptFn,
  onConflict: ConflictPromptFn,
): Promise<JsonObject> {
  const result: JsonObject = {};

  for (const key of Object.keys(upstream)) {
    const upstreamVal = upstream[key] as JsonValue;
    const existingVal = key in existing ? (existing[key] as JsonValue) : undefined;
    const childPointer = `${pointer}/${escapePointer(key)}`;

    if (existingVal === undefined) {
      // Key only in upstream — take it.
      result[key] = deepClone(upstreamVal);
      setNestedPath(projection, key, deepClone(upstreamVal));
      continue;
    }

    // Both sides have the key.
    if (
      pointer === "" &&
      key === "permissions" &&
      isObject(upstreamVal) &&
      isObject(existingVal)
    ) {
      // Special handling for the `permissions` object.
      const mergedPerms = await mergePermissions(
        upstreamVal,
        existingVal,
        projection,
        userKeys,
        childPointer,
        onDeny,
        onConflict,
      );
      result[key] = mergedPerms;
    } else if (isObject(upstreamVal) && isObject(existingVal)) {
      // Recurse into nested objects.
      const childProjection: JsonObject = {};
      const merged = await mergeObjects(
        upstreamVal,
        existingVal,
        childProjection,
        userKeys,
        childPointer,
        onDeny,
        onConflict,
      );
      result[key] = merged;
      // Carry over user-only keys inside nested object.
      for (const ek of Object.keys(existingVal)) {
        if (!(ek in upstreamVal)) {
          (merged as JsonObject)[ek] = deepClone((existingVal as JsonObject)[ek]!);
          userKeys.push(`${childPointer}/${escapePointer(ek)}`);
        }
      }
      setNestedPath(projection, key, childProjection);
    } else if (isEqual(upstreamVal, existingVal)) {
      // No conflict — same value.
      result[key] = deepClone(upstreamVal);
      setNestedPath(projection, key, deepClone(upstreamVal));
    } else {
      // Scalar conflict.
      const choice = await onConflict(childPointer, upstreamVal, existingVal);
      if (choice === "upstream") {
        result[key] = deepClone(upstreamVal);
        setNestedPath(projection, key, deepClone(upstreamVal));
      } else {
        result[key] = deepClone(existingVal);
        userKeys.push(childPointer);
      }
    }
  }

  return result;
}

// ─── Permissions merge ────────────────────────────────────────────────────────

async function mergePermissions(
  upstream: JsonObject,
  existing: JsonObject,
  topProjection: JsonObject,
  userKeys: string[],
  pointer: string,
  onDeny: DenyPromptFn,
  onConflict: ConflictPromptFn,
): Promise<JsonObject> {
  const result: JsonObject = { ...deepClone(existing) };
  const permProjection: JsonObject = {};

  for (const section of ["allow", "ask", "deny"] as const) {
    const upstreamArr = asStringArray(upstream[section]);
    const existingArr = asStringArray(existing[section]);

    if (upstreamArr === null) continue; // upstream doesn't have this section

    if (section === "allow" || section === "ask") {
      // Union silently: add upstream entries not already present.
      const resultSet = new Set(existingArr ?? []);
      for (const rule of upstreamArr) {
        resultSet.add(rule);
      }
      result[section] = [...resultSet];
      // allow/ask are treated as user-editable: user can add or remove entries
      // freely. Exclude from the upstream projection so verify ignores them.
      userKeys.push(`${pointer}/${section}`);
      // permProjection intentionally left without this section.
    } else {
      // deny — prompt for each new upstream entry.
      const resultSet = new Set(existingArr ?? []);
      const accepted: string[] = [];
      for (const rule of upstreamArr) {
        if (!resultSet.has(rule)) {
          const accept = await onDeny(rule);
          if (accept) {
            resultSet.add(rule);
            accepted.push(rule);
          }
          // Declined rule: not added to file, not tracked in projection.
        } else {
          accepted.push(rule);
        }
      }
      result[section] = [...resultSet];
      permProjection[section] = accepted;
    }
  }

  // Carry over existing sections not in upstream.
  for (const key of Object.keys(existing)) {
    if (!(key in upstream)) {
      userKeys.push(`${pointer}/${escapePointer(key)}`);
    }
  }

  setNestedPath(topProjection, "permissions", permProjection);
  return result;
}

// ─── Verify helper ────────────────────────────────────────────────────────────

/**
 * Re-project the upstream contribution from a live (on-disk) settings file.
 *
 * Given the live merged file and the list of `userKeys` recorded at install
 * time, reconstruct what ai-skills contributed by stripping user-controlled
 * paths. The resulting sha should match the `installSha` in the lockfile.
 *
 * This is intentionally conservative: any key not in `userKeys` is assumed
 * to be upstream-contributed. A user who added a key not at install time
 * would need to re-run `init` to update the projection.
 *
 * Returns the sha256 of the stable-serialised projection.
 */
export function reprojectUpstream(live: JsonObject, userKeys: string[]): string {
  const userKeySet = new Set(userKeys);
  const projection = stripUserKeys(live, userKeySet, "");
  return projectionSha(projection);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function stripUserKeys(
  obj: JsonObject,
  userKeys: Set<string>,
  pointer: string,
): JsonObject {
  const result: JsonObject = {};
  for (const key of Object.keys(obj)) {
    const childPointer = `${pointer}/${escapePointer(key)}`;
    if (userKeys.has(childPointer)) continue; // drop user-only key
    const val = obj[key] as JsonValue;
    if (isObject(val)) {
      result[key] = stripUserKeys(val, userKeys, childPointer);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/** Stable JSON serialisation: keys sorted, no extra whitespace. */
function stableStringify(obj: JsonValue): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((obj as JsonObject)[k]!)).join(",") + "}";
}

function projectionSha(projection: JsonValue): string {
  return canonicalSha256(stableStringify(projection));
}

function deepClone<T extends JsonValue>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function isObject(v: JsonValue): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function asStringArray(v: JsonValue | undefined): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string");
}

function escapePointer(key: string): string {
  // RFC 6901: escape `~` as `~0` and `/` as `~1`.
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

function setNestedPath(obj: JsonObject, key: string, value: JsonValue): void {
  obj[key] = value;
}

// ─── Prompt helpers (for init.ts to call) ────────────────────────────────────

/**
 * Build an interactive `onDeny` prompt using @inquirer/prompts.
 * Returns a DenyPromptFn suitable for passing to `mergeSettings`.
 */
export async function buildDenyPrompt(): Promise<DenyPromptFn> {
  const { confirm } = await import("@inquirer/prompts");
  return async (rule: string) => {
    return confirm({
      message: `Allow upstream to add deny rule "${rule}" to permissions.deny?`,
      default: true,
    });
  };
}

/**
 * Build an interactive `onConflict` prompt using @inquirer/prompts.
 * Returns a ConflictPromptFn suitable for passing to `mergeSettings`.
 */
export async function buildConflictPrompt(): Promise<ConflictPromptFn> {
  const { select } = await import("@inquirer/prompts");
  return async (jsonPointer, upstreamValue, userValue) => {
    return select<"upstream" | "user">({
      message: `Conflict at ${jsonPointer}:`,
      choices: [
        {
          name: `Keep upstream: ${JSON.stringify(upstreamValue)}`,
          value: "upstream" as const,
        },
        {
          name: `Keep yours:   ${JSON.stringify(userValue)}`,
          value: "user" as const,
        },
      ],
    });
  };
}
