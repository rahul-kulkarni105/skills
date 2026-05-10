import { readFile } from "node:fs/promises";
import { type Manifest, validateManifest } from "./manifest-schema.js";

/**
 * Load and validate a manifest from an absolute local file path.
 *
 * Throws `Error` (not ManifestValidationError) if the file cannot be read or
 * is not valid JSON. Throws `ManifestValidationError` if the manifest
 * structure is invalid. Downstream code should catch both.
 *
 * Validation is done exactly once here. All callers receive a fully-typed,
 * fully-validated Manifest and may treat it as trusted.
 */
export async function loadManifest(filePath: string): Promise<Manifest> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read manifest at ${filePath}: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Manifest at ${filePath} is not valid JSON`);
  }

  validateManifest(parsed);
  return parsed;
}
