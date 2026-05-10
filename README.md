---
name: AI Skills & Conventions
description: Tool-agnostic, code-free knowledge base of skills, prompts, and instructions for AI coding assistants.
last_reviewed: 2026-05-10
---

# AI Skills & Conventions — multi-tool AI assistant configuration

[![npm](https://img.shields.io/npm/v/%40rahulkulkarniskills%2Fai-skills)](https://www.npmjs.com/package/@rahulkulkarniskills/ai-skills)
[![npm downloads](https://img.shields.io/npm/dm/%40rahulkulkarniskills%2Fai-skills)](https://www.npmjs.com/package/@rahulkulkarniskills/ai-skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](cli/LICENSE)

A code-free, document-only knowledge base of skills, prompts, and instructions
for AI coding assistants — **Claude Code**, **GitHub Copilot**, **OpenAI Codex**,
**Gemini CLI**, **Cursor**, **Windsurf**, and **Ollama**. Built around the
**AGENTS.md** open standard as a single source of truth, with thin tool-native
shims, composable instruction blocks, an adversarial skill suite (grill-me,
convince-me, weak-spots, steelman, pre-mortem), strict token & context
discipline, and per-tool tactics. Consume it as a lightweight Claude
skills repo, through the `ai-skills` CLI, or by copying/pinning the repo
with bootstrap/submodule workflows.

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
- [.claude-plugin/plugin.json](.claude-plugin/plugin.json) — public
  Claude skill installer manifest.
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

There are two primary ways to consume this repo.

### Option 1: Install just the Claude skills

Use this if you only want the `SKILL.md` workflows in Claude Code and do
not need the broader multi-tool installer:

```sh
npx skills@latest add rahul-kulkarni105/skills
```

This reads [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json)
and installs the published skill directories from [skills/](skills/).
It is intentionally simple: no repo bootstrap, no Codex/Cursor/Copilot
shims, no local CLI state.

### Option 2: Use the `ai-skills` CLI

Use this if you want the full multi-tool setup: AGENTS.md, Claude Code
skills, Cursor rules, Copilot instructions, Gemini/Codex shims, selected
bundles, lockfile verification, and target-specific installs.

```sh
npx @rahulkulkarniskills/ai-skills init --ref <tag-or-commit>
```

For local development against this checkout:

```sh
npm --prefix cli install
npm --prefix cli run build
node cli/bin/ai-skills.js init --manifest ./manifest.json
```

The CLI can also verify installed files later:

```sh
npx @rahulkulkarniskills/ai-skills verify
```

### Other sync strategies

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

## Debugging `ai-skills`

The CLI keeps normal command output separate from diagnostic logs. Use
`--verbose` or `AI_SKILLS_LOG=debug` when debugging installer behavior:

```sh
ai-skills --verbose init --manifest ./manifest.json
AI_SKILLS_LOG=debug ai-skills verify
```

Use `--quiet` or `AI_SKILLS_LOG=silent` to suppress diagnostic logs. To
write diagnostics to a file, set `AI_SKILLS_LOG_FILE=/path/to/log.txt`.
Logs redact common secrets, credentials, and absolute paths before output.

## Telemetry Preference

The CLI stores anonymous analytics consent in your user config directory,
never in the project. Manage it with:

```sh
ai-skills telemetry status
ai-skills telemetry enable
ai-skills telemetry disable
```

Environment overrides are respected: `AI_SKILLS_TELEMETRY=0`,
`AI_SKILLS_TELEMETRY=1`, and `DO_NOT_TRACK=1`.

Telemetry events are sent only when consent is enabled and a PostHog public
project key is configured with `AI_SKILLS_POSTHOG_KEY`. Use
`AI_SKILLS_TELEMETRY_DEBUG=1` to print the telemetry decision without sending
events.

## Boundaries

This repo holds **shareable, objective** content (conventions, stack
guidance, adversarial skills, token discipline). **Personal, subjective**
preferences (e.g. "I like terse responses") belong in your global config:
`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`,
Cursor user rules, Copilot personal instructions.

Project config in a consuming repo always wins over the defaults here.
See [docs/working-with-ai.md](docs/working-with-ai.md).

## License

Dual-licensed by component type:

- **Content** (markdown skills, rules, instructions, prompts, stacks,
  docs — everything outside `cli/`): [CC BY 4.0](LICENSE). Creative
  Commons explicitly recommends against CC licenses for software, so
  the CLI is licensed separately.
- **CLI code** (`cli/` — the TypeScript installer published as
  `@rahulkulkarniskills/ai-skills`): [MIT](cli/LICENSE).
