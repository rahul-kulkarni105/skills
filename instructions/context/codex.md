---
name: context-codex
description: Codex CLI-specific context tactics. AGENTS.md hierarchy, instruction-chain budget, config.toml.
last_reviewed: 2026-05-09
---

# Codex CLI — context tactics

Universal rules in
[../context-and-token-discipline.md](../context-and-token-discipline.md)
apply first. The points below are Codex-specific.

## AGENTS.md hierarchy

Codex composes AGENTS.md from three layers, in order:

1. **Global** — `~/.codex/AGENTS.md` (personal defaults).
2. **Project** — `<repo>/AGENTS.md` (this repo).
3. **Sub-tree** — `<repo>/<sub>/AGENTS.md` (per-package overrides).

Lower layers override higher ones. Keep this repo's `AGENTS.md` to the
shareable/objective rules; put personal preferences in `~/.codex/`.

## Instruction-chain budget

Codex sends the entire AGENTS.md chain on every turn. Keep the total
chain under **~3k tokens**. Push detail into linked files —
`instructions/*.md`, `stacks/*/README.md` — that Codex pulls only when
relevant.

If `AGENTS.md` starts repeating itself, split rules into the matching
`instructions/<topic>.md` and reference instead of inline.

## `~/.codex/config.toml` highlights

Personal config (not in this repo). Useful entries:

```toml
[model]
default = "gpt-5"

[approval]
mode = "auto-edit"      # or "manual" for stricter gating

[shell]
allow = ["git", "ls", "rg", "node", "pnpm", "vitest"]
deny  = ["rm -rf /", "git push --force"]
```

Project-specific shell allow/deny lives in
[`.claude/settings.json`](../../.claude/settings.json) for Claude;
Codex equivalents are global in `~/.codex/config.toml`.

## Tool use

- `rg` (ripgrep) is Codex's grep. Use it before `cat`/`Read`.
- Codex respects `.gitignore` for searches. Add build artefacts to
  `.gitignore` if Codex starts surfacing them.
- For "agent-mode" runs, Codex iterates until the task is done. Cap
  with explicit acceptance criteria in the prompt.

## Approval mode

- `manual` for unfamiliar repos.
- `auto-edit` for trusted repos where edits are reversible by git.
- `full-auto` only with a very narrow allow-list and clear acceptance.

## Memory

Codex doesn't have a persistent memory store like Claude. Cross-session
state lives in:

- `AGENTS.md` (durable).
- Git-tracked plan/notes files.
- `~/.codex/AGENTS.md` (personal, persistent).
