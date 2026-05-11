---
name: using-with-codex
description: Wiring this repo into OpenAI Codex CLI — AGENTS.md hierarchy, config, verification.
last_reviewed: 2026-05-09
---

# Using with OpenAI Codex CLI

Codex reads `AGENTS.md` natively at three levels: global
(`~/.codex/AGENTS.md`), repo root, and any sub-tree. The nearest
file up the tree wins.

## Entry file

[../AGENTS.md](../AGENTS.md) is the entry point. Codex reads it on
every prompt. Token & context discipline is composed in.

When installed through `ai-skills`, the Codex target also receives the
top-level files under `instructions/` that AGENTS.md references, plus
[../instructions/context/codex.md](../instructions/context/codex.md).

## Hierarchy

| Layer | Path | Use for |
|---|---|---|
| Global | `~/.codex/AGENTS.md` | Personal prefs across all projects |
| Repo | `<repo>/AGENTS.md` | This repo or the consumer project |
| Subtree | `<repo>/<subtree>/AGENTS.md` | Per-package overrides in monorepos |

Project wins over global. The subtree, if present, wins over the
repo root for files inside it.

## Config

`~/.codex/config.toml` controls model selection, approval mode, and
shell preferences. Sample sections live in
[../instructions/context/codex.md](../instructions/context/codex.md).
Approval modes: `manual`, `auto-edit`, `full-auto`. Use `manual`
in unfamiliar repos.

## Per-tool tactics

[../instructions/context/codex.md](../instructions/context/codex.md)
covers the AGENTS.md hierarchy, the ~3k token chain budget, and
config highlights. Keep repo-specific Codex workflow notes there rather
than growing AGENTS.md.

## Verification

1. Run `codex` in the repo root.
2. Confirm `AGENTS.md` is loaded in the startup instruction chain.
3. Pitch a deliberately-flawed plan — confirm the adversarial
   default surfaces before agreement.
4. Ask a clarification-worthy question — confirm Codex uses its
   approval/inline-question UI rather than plain prose.

## See also

- [tool-matrix.md](tool-matrix.md)
- [../instructions/context/codex.md](../instructions/context/codex.md)
- [../AGENTS.md](../AGENTS.md)
