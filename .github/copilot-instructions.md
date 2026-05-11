<!--
  GitHub Copilot custom instructions.

  AGENTS.md and CLAUDE.md load as always-on instructions on every prompt —
  all universal rules (adversarial default, token discipline, tone, commits,
  secrets) live there. This file adds Copilot-specific surface area only.

  last_reviewed: 2026-05-10
-->

# Copilot — project additions

> **Precedence.** Consumer project config wins over these defaults.

## Adversarial skills

Five skills are available as slash commands in Chat:

- `/grill-me` — aggressively challenge a plan or design
- `/weak-spots` — structured failure-mode audit across 8 axes
- `/pre-mortem` — imagine it shipped and failed; explain why
- `/steelman` — build the strongest case for the rejected option
- `/convince-me` — Socratic cross-examination of a stated decision

## Code-file rules

`.github/instructions/code-quality.instructions.md` loads automatically
when code files are in context (scoped via `applyTo`). Covers scope
discipline, error handling, comments, tests, types, performance, security.

## Verify instructions loaded

After any Chat reply, expand **References** to confirm instruction files
were picked up. If `copilot-instructions.md` is missing, verify that
`github.copilot.chat.codeGeneration.useInstructionFiles` is `true` in
settings.

> **Note:** Custom instructions apply to Chat only — inline completions
> do not see them.
