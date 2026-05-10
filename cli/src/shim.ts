/**
 * Shim renderer for inline-content targets (Cursor, Copilot).
 *
 * Decision (resolved 2026-05-09): shims inline the canonical file's content
 * verbatim rather than using @file/@import references. This is because
 * Cursor's @file directive does not resolve paths outside `.cursor/`.
 *
 * Rendered format (hash-comment targets, e.g. Cursor):
 *   # managed-by: ai-skills@<version> — do not edit; regenerated on upgrade
 *   # source: <repo-relative-canonical-path>
 *
 *   <canonical content verbatim>
 *
 * Rendered format (HTML-comment targets, e.g. Copilot):
 *   <!-- managed-by: ai-skills@<version> — do not edit; regenerated on upgrade -->
 *   <!-- source: <repo-relative-canonical-path> -->
 *
 *   <canonical content verbatim>
 *
 * The `installSha` recorded in the lockfile for shim entries is the
 * canonicalSha256 of the *rendered* output, not the canonical source.
 * `verify` classifies any change to the rendered file as drift, identically
 * to how it classifies drift in a copied canonical file.
 */

import { posix } from "node:path";
import { type ShimTemplate } from "./manifest-schema.js";
import { CLI_VERSION } from "./version.js";

// ─── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Render an inline-content shim for a canonical source file.
 *
 * @param template - The ShimTemplate entry from the manifest.
 * @param canonicalContent - Raw content of the canonical source file (may be Buffer or string).
 * @param repoRelativeSource - Repo-relative path to the canonical source, e.g. "AGENTS.md".
 *                             Always emitted with forward slashes (path.posix).
 * @returns The rendered shim as a LF-normalized string with a trailing newline.
 */
export function renderShim(
  template: ShimTemplate,
  canonicalContent: Buffer | string,
  repoRelativeSource: string,
): string {
  // Always use forward slashes in embedded paths (cross-session invariant).
  const sourcePath = posix.normalize(
    typeof repoRelativeSource === "string"
      ? repoRelativeSource.split("\\").join("/")
      : repoRelativeSource,
  );

  const isHtmlComment = template.managedByHeader.startsWith("<!--");

  let header: string;
  if (isHtmlComment) {
    header = [
      `<!-- managed-by: ai-skills@${CLI_VERSION} — do not edit; regenerated on upgrade -->`,
      `<!-- source: ${sourcePath} -->`,
      "",
    ].join("\n");
  } else {
    // Hash-comment style (Cursor .mdc files, etc.)
    header = [
      `# managed-by: ai-skills@${CLI_VERSION} — do not edit; regenerated on upgrade`,
      `# source: ${sourcePath}`,
      "",
    ].join("\n");
  }

  // Normalise canonical content: CRLF → LF; ensure trailing newline.
  const raw =
    typeof canonicalContent === "string"
      ? canonicalContent
      : canonicalContent.toString("utf8");
  const normalised = raw.replace(/\r\n/g, "\n");
  const body = normalised.endsWith("\n") ? normalised : normalised + "\n";

  return header + "\n" + body;
}

// ─── Re-render trigger ────────────────────────────────────────────────────────

/**
 * Returns true when a shim must be re-rendered.
 *
 * A re-render is triggered when ANY element of the triple
 *   (canonical sha, template sha, rendered destination path)
 * has changed since the last install.
 */
export function shimNeedsRerender(opts: {
  lockedCanonicalSha: string;
  lockedTemplateSha: string;
  lockedDest: string;
  currentCanonicalSha: string;
  currentTemplateSha: string;
  currentDest: string;
}): boolean {
  return (
    opts.lockedCanonicalSha !== opts.currentCanonicalSha ||
    opts.lockedTemplateSha !== opts.currentTemplateSha ||
    opts.lockedDest !== opts.currentDest
  );
}
