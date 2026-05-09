---
name: sync-strategies
description: Two ways consumer projects pull this repo in — submodule vs bootstrap — and when to pick which.
last_reviewed: 2026-05-09
---

# Sync strategies

Two supported ways to bring this repo into a consumer project.
Pick by how tightly the team needs to track upstream.

## TL;DR

| Use case | Strategy |
|---|---|
| Single-developer / casual / want defaults and forget | **Bootstrap** |
| Team project / want pinned, reviewable upgrades | **Submodule** |
| Just want to read it on GitHub | Neither — read in place |

## Submodule

Pin a known-good commit. Upgrades are an explicit `git submodule
update` + commit.

```bash
git submodule add https://github.com/<org>/skills .ai-skills
git submodule update --init
```

Then symlink or reference the subset you want from the consumer
project:

```bash
ln -s .ai-skills/AGENTS.md AGENTS.md
ln -s .ai-skills/.cursor/rules/000-index.mdc .cursor/rules/000-index.mdc
```

Pros:

- Version pinning. The team agrees on a commit.
- Upgrades are reviewable in PRs (the submodule pointer changes).
- No drift between clones.

Cons:

- Submodules are a sharp tool. New contributors need
  `git submodule update --init` after `git clone`.
- Symlinks are awkward on Windows without dev mode enabled.

## Bootstrap

A degit-style snapshot copy via `git archive`. No git metadata is
left in the consumer project.

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<org>/skills/main/bootstrap/install.sh) \
  /path/to/consumer-project
```

This produces `.ai-skills/` inside the consumer project containing
the chosen subset.

Pros:

- Zero ongoing coupling. Files become the consumer's to own.
- No submodule machinery.
- Easy to diff and customise locally.

Cons:

- Upgrades are manual. Re-running the bootstrap overwrites local
  edits unless you handle it carefully.
- Drift across clones is possible.

See [../bootstrap/README.md](../bootstrap/README.md) for the script
itself.

## Decision tree

1. Are you a team of 2+ on a project that ships? → **Submodule.**
2. Are you a solo developer or a one-off project? → **Bootstrap.**
3. Do you want to fork and own the content yourself? →
   Fork on GitHub; ignore both options.

## Which files to import

Most consumers want the subset that the AI tools actually read:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/000-index.mdc`
- `.claude/settings.json` (review before importing — project rules)
- `.vscode/settings.json` (review before importing — Copilot context)
- `instructions/`
- `skills/`
- `stacks/`
- `prompts/`

Skip `docs/`, `bootstrap/`, `LICENSE`, `README.md` unless the
consumer project wants them too.

## Project wins on conflict

When this repo is imported, the consumer project's local files
override anything here. The override is asserted in AGENTS.md and
CLAUDE.md. To override a single rule, copy the file, change the rule,
keep the path. To override broadly, write a project-level
`AGENTS.md` / `CLAUDE.md` that supersedes the imported one.

## See also

- [architecture.md](architecture.md)
- [tool-matrix.md](tool-matrix.md)
- [contributing.md](contributing.md)
