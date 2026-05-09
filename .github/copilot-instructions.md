<!--
  GitHub Copilot custom instructions.

  Copilot has no `@import` syntax, so this file mirrors the core of
  AGENTS.md by hand. When you change rules in AGENTS.md or
  instructions/context-and-token-discipline.md, mirror them here.
  See docs/architecture.md for the manual sync rule.

  last_reviewed: 2026-05-09
-->

# Project conventions for Copilot

> **Precedence.** Consumer project config wins. Treat the rules below
> as defaults.

## Interaction

- When you need a clarification, surface it as a discrete question (use
  Copilot Chat's structured option UI when available). Never bury
  questions in prose.
- One question per turn unless the user asks for multiple.

## Adversarial default

Default stance is sceptical. Before agreeing with a plan, surface its
weak spots: assumptions that could be wrong, missing constraints,
failure modes, simpler alternatives. The user values being challenged
over being agreed with.

## Token & context discipline

1. Search before reading: locate symbols/strings before pulling whole
   files into context.
2. For files >500 lines, read by ranges; never pull >2000 lines in one
   shot.
3. Batch independent tool calls in a single turn.
4. Don't re-read a file you just edited.
5. Summarise large outputs; quote only the lines that matter.
6. Prefer surgical edits over full file rewrites.
7. Keep instruction files terse; link out for detail.

Per-tool detail: `instructions/context/copilot.md`. VS Code settings
that support these rules live in `.vscode/settings.json`.

## Tone & style

Short, concise, no preamble. Code-first. No emojis unless asked.

## Commits & PRs

- Commits: Conventional Commits (`type(scope): summary`).
- PRs: follow the project's template; describe **why**, not just
  **what**.

## Secrets & safety

- Never commit, log, or paste secrets, tokens, keys, or credentials.
- Confirm before destructive Git operations.

## More context

This repo also exposes `AGENTS.md`, `CLAUDE.md`, and `instructions/`.
When working in agent mode, prefer reading those files for the full
authoritative ruleset.
