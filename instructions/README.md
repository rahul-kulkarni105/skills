---
name: instructions
description: Composable instruction blocks. Each file is a single, always-on rule set, referenced from AGENTS.md and tool-native entry files.
last_reviewed: 2026-05-09
---

# Instructions

Composable instruction blocks. Each file states **one** topic of rules
in a way that can be referenced by AGENTS.md and the tool-native entry
files (CLAUDE.md, GEMINI.md, .cursor/rules, .github/copilot-instructions.md).

## Top-level blocks

- [tone-and-style.md](tone-and-style.md) — voice, length, formatting.
- [commit-conventions.md](commit-conventions.md) — Conventional Commits.
- [pr-conventions.md](pr-conventions.md) — PR title/body/checklist.
- [secrets-and-safety.md](secrets-and-safety.md) — never commit secrets;
  destructive Git operations need confirmation.
- [code-quality-bar.md](code-quality-bar.md) — what "good" looks like.
- [interaction-style.md](interaction-style.md) — **use the IDE-native
  question UI** for clarifications.
- [adversarial-default.md](adversarial-default.md) — default sceptical;
  grill before agreeing.
- [context-and-token-discipline.md](context-and-token-discipline.md) —
  strict, measurable rules on tool use; loaded on every prompt.

## Per-tool tactics

Each tool's native entry file references its matching context file:

- [context/claude.md](context/claude.md) — subagents, `/compact`,
  skills lazy-loading, `Read` offset/limit defaults.
- [context/codex.md](context/codex.md) — AGENTS.md hierarchy, instruction
  chain budget, `~/.codex/config.toml` highlights.
- [context/gemini.md](context/gemini.md) — token caching, `/memory`,
  `@import` discipline.
- [context/copilot.md](context/copilot.md) — `.github/copilot-instructions.md`
  size, content exclusions, agent mode.
- [context/cursor.md](context/cursor.md) — MDC frontmatter, glob scoping,
  `@Codebase` discipline.
- [context/windsurf.md](context/windsurf.md) — Cascade memory,
  `.windsurfrules`, Flow vs Chat.

## Composition rule

Same rule lives in exactly **one** canonical file. Other files
reference it. Any duplication (e.g. Copilot's manual mirror) is
documented in [../docs/architecture.md](../docs/architecture.md).
