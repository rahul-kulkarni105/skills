/**
 * Ref validator: only signed tags (`v\d+…`) or 40-char lowercase hex commit
 * shas are accepted. Branch names are always rejected.
 *
 * Rationale: mutable refs (branches, `HEAD`, `latest`) mean the installed
 * content can silently change between `init` and `verify`. Pinned refs are
 * required for reproducibility and supply-chain safety.
 */

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const SEMVER_TAG_RE = /^v\d+\.\d+\.\d+/;

export type RefKind = "commit" | "tag";

export interface ValidatedRef {
  kind: RefKind;
  ref: string;
}

/**
 * Validate `ref` and return it typed.
 *
 * Accepts:
 *   - 40-char lowercase hex commit sha  (kind: "commit")
 *   - semver tag starting with `v`      (kind: "tag")
 *
 * Throws `RefValidationError` for anything else (branch names, `HEAD`,
 * short shas, mixed-case shas, non-semver tags, empty string).
 */
export function validateRef(ref: string): ValidatedRef {
  if (!ref || ref.trim() !== ref) {
    throw new RefValidationError(ref, "ref must be a non-empty string with no surrounding whitespace");
  }

  if (COMMIT_SHA_RE.test(ref)) {
    return { kind: "commit", ref };
  }

  if (SEMVER_TAG_RE.test(ref)) {
    return { kind: "tag", ref };
  }

  // Produce a helpful message for the most common mistake.
  if (/^[0-9a-f]{1,39}$/i.test(ref)) {
    throw new RefValidationError(
      ref,
      "looks like a short commit sha — provide the full 40-character sha",
    );
  }

  if (/^[0-9A-F]{40}$/.test(ref)) {
    throw new RefValidationError(ref, "commit sha must be lowercase hex");
  }

  throw new RefValidationError(
    ref,
    "must be a full 40-char commit sha or a semver tag (e.g. v1.2.3). " +
      "Branch refs are rejected — they are mutable and unsafe to pin.",
  );
}

export class RefValidationError extends Error {
  constructor(public readonly ref: string, reason: string) {
    super(`Invalid ref "${ref}": ${reason}`);
    this.name = "RefValidationError";
  }
}
