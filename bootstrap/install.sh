#!/usr/bin/env bash
# bootstrap/install.sh — degit-style snapshot copy of this repo.
#
# Streams `git archive` of a chosen ref from the source repo into
# <dest> inside the target project. No .git metadata is written.
#
# Usage:
#   bash install.sh [--dest .ai-skills] [--ref main] [--source <git-url>]

set -euo pipefail

DEST=".ai-skills"
REF="main"
SOURCE_URL="${SKILLS_SOURCE_URL:-https://github.com/REPLACE-ME/skills.git}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest)   DEST="$2";       shift 2 ;;
    --ref)    REF="$2";        shift 2 ;;
    --source) SOURCE_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 64
      ;;
  esac
done

if [[ -e "$DEST" && -n "$(ls -A "$DEST" 2>/dev/null || true)" ]]; then
  echo "Refusing to overwrite non-empty destination: $DEST" >&2
  echo "Pick a different --dest or remove the existing folder." >&2
  exit 65
fi

mkdir -p "$DEST"

echo "Fetching $SOURCE_URL @ $REF -> $DEST"
git archive --format=tar --remote="$SOURCE_URL" "$REF" \
  | tar -x -C "$DEST" 2>/dev/null \
  || {
    # Fallback: some hosts don't support git archive over HTTPS.
    # Use a shallow clone to a tmp dir and copy without .git.
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    git clone --depth=1 --branch "$REF" "$SOURCE_URL" "$TMP" >/dev/null 2>&1
    rm -rf "$TMP/.git"
    # Move contents into DEST.
    (cd "$TMP" && tar -cf - .) | (cd "$DEST" && tar -xf -)
  }

cat <<EOF

Done. Snapshot extracted into: $DEST

Wire it into your project (paste into your AGENTS.md / CLAUDE.md):

  @${DEST}/AGENTS.md

For Cursor, add .cursor/rules/000-shared.mdc:

  ---
  description: Shared AI conventions
  alwaysApply: true
  ---
  See ${DEST}/AGENTS.md and ${DEST}/instructions/context/cursor.md.

For Copilot, mirror the relevant rules into your own
.github/copilot-instructions.md (Copilot has no import support).

See ${DEST}/docs/sync-strategies.md for trade-offs vs submodule.
EOF
