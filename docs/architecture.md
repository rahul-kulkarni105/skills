---
name: architecture
description: Why this layout exists and how files compose at runtime across tools.
last_reviewed: 2026-05-09
---

# Architecture

This repo is a reusable knowledge base for AI assistants plus a small
TypeScript installer. The model-facing content lives in markdown files;
the CLI in [../cli/](../cli/) installs selected rules, instructions,
skills, and settings into consumer projects from [../manifest.json](../manifest.json).

## The single source of truth

[AGENTS.md](../AGENTS.md) is the de-facto entry point. It is the only
file every modern agent (Codex, Cursor, Gemini CLI agent mode,
Windsurf, Copilot agent mode) reads natively.

Everything that should apply to **all tools** is composed into
AGENTS.md by reference:

- [instructions/interaction-style.md](../instructions/interaction-style.md)
- [instructions/adversarial-default.md](../instructions/adversarial-default.md)
- [instructions/tone-and-style.md](../instructions/tone-and-style.md)
- [instructions/commit-conventions.md](../instructions/commit-conventions.md)
- [instructions/pr-conventions.md](../instructions/pr-conventions.md)
- [instructions/secrets-and-safety.md](../instructions/secrets-and-safety.md)
- [instructions/code-quality-bar.md](../instructions/code-quality-bar.md)
- [instructions/context-and-token-discipline.md](../instructions/context-and-token-discipline.md)

## Tool-native shims

Tools that don't read AGENTS.md natively get a thin shim file at the
path they expect. Each shim either imports AGENTS.md (where the tool
supports `@import` syntax) or mirrors AGENTS.md's core (where it
doesn't).

| Tool | Native path | Strategy |
|---|---|---|
| Claude Code | [CLAUDE.md](../CLAUDE.md) | References AGENTS.md + lists `skills/` |
| Gemini CLI | [GEMINI.md](../GEMINI.md) | `@AGENTS.md` import + per-tool context |
| Cursor | [.cursor/rules/000-index.mdc](../.cursor/rules/000-index.mdc) | `alwaysApply: true`, references AGENTS.md |
| Copilot | [.github/copilot-instructions.md](../.github/copilot-instructions.md) | Mirrors AGENTS.md core verbatim (no import) |
| Codex | [AGENTS.md](../AGENTS.md) | Native — no shim needed |
| Windsurf | [AGENTS.md](../AGENTS.md) | Native — no shim needed |

The full mapping (including per-tool context files) lives in
[tool-matrix.md](tool-matrix.md).

## Per-tool tactics

Universal token & context discipline lives in
[instructions/context-and-token-discipline.md](../instructions/context-and-token-discipline.md).
Tactics that genuinely differ between tools live in their own files
under [instructions/context/](../instructions/context/), one per tool:
`claude.md`, `codex.md`, `gemini.md`, `copilot.md`, `cursor.md`,
`windsurf.md`. Each tool's native entry file references its matching
context file, so the tool loads it on every prompt.

## Composition order at runtime

When an agent boots inside a project that has imported this repo:

1. Tool loads its native entry (`AGENTS.md`, `CLAUDE.md`, etc.).
2. Entry file pulls in the universal instruction set.
3. Entry file pulls in the per-tool context file.
4. Skills (Claude Code) become discoverable by their `description`
   frontmatter; bodies load on activation.
5. Project-level config in the **consumer** repo overrides anything
   here. (See *Project wins*, below.)

## Canonical-file rule

Same content lives in **exactly one** canonical file. Other files
reference it. The one accepted exception is the manual mirror between
[AGENTS.md](../AGENTS.md) and
[.github/copilot-instructions.md](../.github/copilot-instructions.md)
— Copilot has no `@import` support, so we duplicate the core rules
and document the sync requirement in
[contributing.md](contributing.md).

## Project wins

Consumer-project config always wins. AGENTS.md, CLAUDE.md, and the
Copilot mirror state this explicitly so that a project that imports
this repo can override any rule without forking.

## Three buckets, one rule each

| Bucket | When it applies | How it loads |
|---|---|---|
| `instructions/` | **Always.** Unconditional rules. | Composed into AGENTS.md / CLAUDE.md. |
| `prompts/` | **On user trigger.** Task templates. | Copy-pasted into the chat. |
| `skills/` | **On match.** Claude discovers by `description`. | Loaded when the description matches the task. |

Decision rule: see
[style-guide.md](style-guide.md#instructions-vs-prompts-vs-skills).

## Decay model

Every content file carries `last_reviewed: YYYY-MM-DD` frontmatter.
Files older than 6 months render with a "may be stale" banner — a
documented convention the AI surfaces when it reads a file (no CI, no
automation).

## What is deliberately NOT here

- No CI workflows.
- No symlinks (every file is a real file at its tool-native path).
- No initial stack-file content beyond domain READMEs.

If/when those become necessary, they go in their own follow-up.
