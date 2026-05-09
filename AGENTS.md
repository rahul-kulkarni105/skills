---
name: AGENTS.md
description: Universal entry for any AGENTS.md-aware agent. Composes interaction, adversarial, quality, and token-discipline rules.
last_reviewed: 2026-05-08
---

# AGENTS.md

Universal entry for AI coding assistants in this repository. Read by
**OpenAI Codex, Cursor, Gemini CLI, GitHub Copilot agent mode,
Windsurf**, and any tool implementing the [agents.md](https://agents.md)
spec.

> **Precedence.** If this repository is consumed by another project, the
> consumer project's own configuration wins. Treat everything below as a
> default, not a mandate. When in doubt, follow project-local
> `AGENTS.md` / `CLAUDE.md` / `.cursor/rules/` over what is here.

## Behaviour rules (always on)

These instruction blocks load on every prompt. Each block lives in its
own file so it can be referenced individually; the rules below are the
authoritative summary.

### Interaction style

When you need a clarification or a decision from the user, **use the
IDE's native question UI**, not plain prose:

- Claude Code → `AskUserQuestion`.
- Cursor / Copilot Chat → use the chat's structured option UI when
  available.
- Codex / Gemini CLI / terminal-only tools → fall back to a numbered list
  of options and a single explicit question.

Never bury a clarifying question inside a paragraph. One question per
turn unless the user asked for multiple. Full text in
[instructions/interaction-style.md](instructions/interaction-style.md).

### Adversarial default

Default stance is **sceptical**. Before agreeing with a plan, surface its
weak spots: assumptions that could be wrong, missing constraints,
failure modes, simpler alternatives. The user values being challenged
over being agreed with. Full text in
[instructions/adversarial-default.md](instructions/adversarial-default.md).

### Token & context discipline

Strict, measurable rules on tool use. Loaded on every prompt across
every tool. Authoritative file:
[instructions/context-and-token-discipline.md](instructions/context-and-token-discipline.md).

Core rules:

1. Use `Grep` / `Glob` (or the tool's equivalent) before `Read` when
   locating a symbol or string. Read whole files only after the location
   is known.
2. When a file exceeds 500 lines, pass `offset` and `limit` to `Read`.
   Never read past line 2000 in a single call.
3. Batch independent tool calls into a single message. Sequential calls
   are reserved for true data dependencies.
4. Never re-read a file immediately after `Edit` / `Write` — the harness
   already tracked the change.
5. Delegate broad codebase searches to a subagent when more than 3
   queries are likely; otherwise inline.
6. Do not paste large tool output back into responses. Summarise, then
   quote only the lines that matter.
7. Prefer `Edit` over `Write` for existing files; `Write` is for new
   files or full rewrites.
8. Keep `AGENTS.md` and `CLAUDE.md` under ~3k tokens combined; push
   detail into linked instruction files.
9. A skill's `description` frontmatter is the only thing the model sees
   until activation — keep it precise; keep skill bodies under ~500
   lines.

### Tone & style

Short, concise, no preamble. See
[instructions/tone-and-style.md](instructions/tone-and-style.md).

### Code quality bar

See [instructions/code-quality-bar.md](instructions/code-quality-bar.md).

### Commits & PRs

Conventional Commits; PRs use the project's template. See
[instructions/commit-conventions.md](instructions/commit-conventions.md)
and [instructions/pr-conventions.md](instructions/pr-conventions.md).

### Secrets & safety

Never commit, log, or paste secrets. Confirm before destructive Git
operations. See
[instructions/secrets-and-safety.md](instructions/secrets-and-safety.md).

## Where to look next

- **Skills** (Claude-discovered task patterns) → [skills/](skills/).
  Adversarial seed suite: `grill-me`, `convince-me`, `weak-spots`,
  `steelman`, `pre-mortem`.
- **Prompts** (copy-pasteable task templates) → [prompts/](prompts/).
- **Stack guidance** (per-domain conventions) → [stacks/](stacks/).
- **Per-tool tactics** → `instructions/context/<tool>.md`. Each tool's
  native entry file references its matching context file.
- **Architecture & rationale** → [docs/architecture.md](docs/architecture.md).
- **Tool matrix** → [docs/tool-matrix.md](docs/tool-matrix.md) — which
  tool reads which file.

## Decay

Every content file carries `last_reviewed: YYYY-MM-DD`. Files older than
6 months should be flagged "may be stale" when read; verify against
current documentation before acting on them. Repo-wide review checkpoint:
**2026-08-08**. See [docs/working-with-ai.md](docs/working-with-ai.md).
