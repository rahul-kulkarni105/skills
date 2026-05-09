---
name: tool-matrix
description: Canonical table of which file each AI tool reads and how token discipline reaches it.
last_reviewed: 2026-05-09
---

# Tool matrix

Which file each tool reads at conversation start, and where its token
& context discipline comes from.

> **Verify before relying.** Tool docs change. Re-check each tool's
> current docs at review time and update this table.

## Entry files

| Tool | Native entry | Imports AGENTS.md? | Per-tool context file |
|---|---|---|---|
| Claude Code | [CLAUDE.md](../CLAUDE.md) | Reference (no `@import`) | [instructions/context/claude.md](../instructions/context/claude.md) |
| OpenAI Codex CLI | [AGENTS.md](../AGENTS.md) | Native — root file | [instructions/context/codex.md](../instructions/context/codex.md) |
| Gemini CLI | [GEMINI.md](../GEMINI.md) | `@AGENTS.md` | [instructions/context/gemini.md](../instructions/context/gemini.md) |
| GitHub Copilot | [.github/copilot-instructions.md](../.github/copilot-instructions.md) | Manual mirror (no import) | [instructions/context/copilot.md](../instructions/context/copilot.md) |
| Cursor | [.cursor/rules/000-index.mdc](../.cursor/rules/000-index.mdc) | Reference | [instructions/context/cursor.md](../instructions/context/cursor.md) |
| Windsurf | [AGENTS.md](../AGENTS.md) | Native | [instructions/context/windsurf.md](../instructions/context/windsurf.md) |
| Ollama | n/a (runtime) | n/a | [stacks/llm/README.md](../stacks/llm/README.md) |

## Discovery surfaces

| Surface | Tool support |
|---|---|
| Skills (`SKILL.md` frontmatter) | Claude Code only |
| Slash commands | Claude Code (`.claude/commands/`); Gemini (`/memory`, `/tools`) |
| Hooks | Claude Code |
| Settings file | Claude Code (`.claude/settings.json`), VS Code Copilot (`.vscode/settings.json`) |
| Native question UI | Claude Code (`AskUserQuestion`), Cursor (inline), Copilot (chips), Codex (approvals), Gemini (inline), Windsurf (inline) |

## What loads on every prompt

| Tool | Universal rules | Per-tool tactics | Project-specific |
|---|---|---|---|
| Claude Code | via `CLAUDE.md` → AGENTS.md | via `CLAUDE.md` → `instructions/context/claude.md` | `./CLAUDE.md` in consumer repo |
| Codex | via `AGENTS.md` directly | via `AGENTS.md` → `instructions/context/codex.md` | nearest `AGENTS.md` up the tree |
| Gemini | via `GEMINI.md` → `@AGENTS.md` | via `GEMINI.md` → `instructions/context/gemini.md` | `./GEMINI.md` in consumer repo |
| Copilot | via `.github/copilot-instructions.md` (mirror) | via `.github/copilot-instructions.md` (mirror) | same path in consumer repo |
| Cursor | via `000-index.mdc` (alwaysApply) | via `000-index.mdc` reference | `.cursor/rules/*.mdc` in consumer repo |
| Windsurf | via `AGENTS.md` | via `AGENTS.md` reference | `./.windsurfrules` (legacy) or `AGENTS.md` |

## Conflict precedence

Highest priority first:

1. Consumer project config (project-level `AGENTS.md`, `CLAUDE.md`,
   `.cursor/rules/`, etc.).
2. This repo (when imported via submodule or bootstrap).
3. User global config (`~/.claude/CLAUDE.md`,
   `~/.codex/AGENTS.md`, etc.).
4. Tool defaults.

The "project wins" rule is asserted in AGENTS.md and CLAUDE.md so
consumers can override without forking.

## See also

- [architecture.md](architecture.md) — why this layout.
- [sync-strategies.md](sync-strategies.md) — submodule vs bootstrap.
- [using-with-*.md](.) — per-tool walkthroughs.
