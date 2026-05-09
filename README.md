---
name: AI Skills & Conventions
description: Tool-agnostic, code-free knowledge base of skills, prompts, and instructions for AI coding assistants.
last_reviewed: 2026-05-08
---

# AI Skills & Conventions — multi-tool AI assistant configuration

A code-free, document-only knowledge base of skills, prompts, and instructions
for AI coding assistants — **Claude Code**, **GitHub Copilot**, **OpenAI Codex**,
**Gemini CLI**, **Cursor**, **Windsurf**, and **Ollama**. Built around the
**AGENTS.md** open standard as a single source of truth, with thin tool-native
shims, composable instruction blocks, an adversarial skill suite (grill-me,
convince-me, weak-spots, steelman, pre-mortem), strict token & context
discipline, and per-tool tactics. Drop-in via submodule or bootstrap script.

**Keywords:** AGENTS.md, agentic AI, AI agents, AI tooling, Claude Code skills,
Cursor rules, Copilot instructions, Gemini CLI, Codex, Windsurf, Ollama,
prompt engineering, context engineering, LLM workflows, developer tooling.

The repo's primary reader is the AI itself; humans are the secondary
audience. Files are written so a model can consume them mid-task — short
sections, explicit headings, no clever prose.

## What lives here

- [AGENTS.md](AGENTS.md) — universal entry, read by Codex, Cursor, Gemini
  CLI, Copilot agent mode, Windsurf.
- [CLAUDE.md](CLAUDE.md) — Claude Code project memory.
- [GEMINI.md](GEMINI.md) — Gemini CLI shim that imports `AGENTS.md`.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) —
  Copilot's native instructions path (manual mirror of `AGENTS.md` core).
- [.cursor/rules/000-index.mdc](.cursor/rules/000-index.mdc) — Cursor MDC
  rule, always applied.
- [skills/](skills/) — Claude Code Agent Skills (SKILL.md format).
- [prompts/](prompts/) — tool-agnostic, copy-pasteable prompts.
- [instructions/](instructions/) — composable, always-on instruction
  blocks (commits, PRs, secrets, quality bar, interaction style,
  adversarial default, token & context discipline).
- [stacks/](stacks/) — domain-grouped guidance (frontend, build, testing,
  runtime, languages, infra, llm).
- [docs/](docs/) — architecture, tool matrix, style guide, sync
  strategies, per-tool wiring guides.
- [bootstrap/](bootstrap/) — degit-style copy-into-project script.

## Quick start

Pick a sync strategy in [docs/sync-strategies.md](docs/sync-strategies.md):

- **Bootstrap (easy mode)** — one-shot snapshot copy via `git archive`. Run
  [`bootstrap/install.sh`](bootstrap/install.sh) inside a target project.
- **Submodule (pinned mode)** — `git submodule add` for version-locked
  team consumption.

Per-tool wiring lives in [docs/](docs/):
[claude-code](docs/using-with-claude-code.md),
[copilot](docs/using-with-copilot.md),
[codex](docs/using-with-codex.md),
[gemini-cli](docs/using-with-gemini-cli.md),
[cursor](docs/using-with-cursor.md),
[windsurf](docs/using-with-windsurf.md),
[ollama](docs/using-with-ollama.md).

## Boundaries

This repo holds **shareable, objective** content (conventions, stack
guidance, adversarial skills, token discipline). **Personal, subjective**
preferences (e.g. "I like terse responses") belong in your global config:
`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`,
Cursor user rules, Copilot personal instructions.

Project config in a consuming repo always wins over the defaults here.
See [docs/working-with-ai.md](docs/working-with-ai.md).

## License

[CC BY 4.0](LICENSE).
