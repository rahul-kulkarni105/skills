---
name: bootstrap
description: degit-style snapshot copy of this repo into a target project, no Git metadata.
last_reviewed: 2026-05-09
---

# Bootstrap

One-shot snapshot copy of this repo into a target project. Uses
`git archive` so the destination ends up with content only — no `.git`
folder, no submodule metadata, no upstream tracking.

Use this when you want to **start a project with these conventions** and
diverge as needed. If you want **version-locked, upstream-tracked**
consumption, use a Git submodule instead — see
[../docs/sync-strategies.md](../docs/sync-strategies.md).

## Usage

From any target project directory:

```sh
bash <(curl -fsSL https://raw.githubusercontent.com/<org>/skills/main/bootstrap/install.sh) \
  --dest .ai-skills
```

Or, if you have this repo cloned locally:

```sh
bash /path/to/skills/bootstrap/install.sh --dest .ai-skills
```

Flags:

- `--dest <path>` — where to drop the snapshot inside the target project.
  Default: `.ai-skills`.
- `--ref <branch|tag|sha>` — pin to a specific revision. Default: `main`.
- `--source <git-url>` — override the source repo URL.

## What it does

1. Resolves the chosen ref against the source repo.
2. Runs `git archive` to stream a tarball of that ref.
3. Extracts into `<dest>` inside the target project.
4. Prints a one-liner you can paste into the target project's
   `AGENTS.md` / `CLAUDE.md` to wire it up.

It does **not** copy `.git/`, write any state into the target's `.git/`,
or modify the target's existing files outside `<dest>`.

## After bootstrap

Wire the bootstrapped folder into the target project:

- Add `@.ai-skills/AGENTS.md` (or the path you chose) to the target
  project's `AGENTS.md` / `GEMINI.md`.
- Add a top-level pointer in the target project's `CLAUDE.md`.
- For Cursor: add a thin `.cursor/rules/000-shared.mdc` that references
  `.ai-skills/AGENTS.md`.
- For Copilot: paste the relevant sections of
  `.ai-skills/.github/copilot-instructions.md` into the target's own
  `.github/copilot-instructions.md` (Copilot has no import support).

See [../docs/sync-strategies.md](../docs/sync-strategies.md) for the
trade-offs vs submodule.
