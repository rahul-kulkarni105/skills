---
name: AI Skills & Conventions
description: Tool-agnostic, code-free knowledge base of skills, prompts, and instructions for AI coding assistants.
last_reviewed: 2026-05-10
---

# AI Skills & Conventions

[![npm](https://img.shields.io/npm/v/%40rahulkulkarniskills%2Fai-skills)](https://www.npmjs.com/package/@rahulkulkarniskills/ai-skills)
[![npm downloads](https://img.shields.io/npm/dm/%40rahulkulkarniskills%2Fai-skills)](https://www.npmjs.com/package/@rahulkulkarniskills/ai-skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](cli/LICENSE)

Reusable AI coding-assistant skills, prompts, and instructions.

Pick one:

1. **Option 1:** install just the Claude Code skills.
2. **Option 2:** use the CLI for the broader multi-tool setup.

## Option 1: Install Claude Skills

This is the simplest path. Use it if you only want the `SKILL.md`
workflows in Claude Code:

```sh
npx skills@latest add rahul-kulkarni105/skills
```

The installer reads [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json)
and installs the published skills from [skills/](skills/).

## Option 2: Use The CLI

Use this if you want everything in Option 1, plus the extra multi-tool
setup:

- AGENTS.md, CLAUDE.md, and GEMINI.md entry files.
- Cursor rules and GitHub Copilot instructions.
- Codex, Gemini CLI, Windsurf, and Ollama guidance.
- Selected bundles instead of installing everything.
- Lockfile verification so installed files can be checked later.
- Bootstrap/submodule-friendly project setup.

```sh
npx @rahulkulkarniskills/ai-skills init --ref <tag-or-commit>
```

For local development against this checkout:

```sh
npm --prefix cli install
npm --prefix cli run build
node cli/bin/ai-skills.js init --manifest ./manifest.json
```

Verify installed files:

```sh
npx @rahulkulkarniskills/ai-skills verify
```

For debugging:

```sh
ai-skills --verbose init --manifest ./manifest.json
AI_SKILLS_LOG=debug ai-skills verify
```

For telemetry preferences:

```sh
ai-skills telemetry status
ai-skills telemetry enable
ai-skills telemetry disable
```

Telemetry consent is stored in your user config directory, not in the
project. `DO_NOT_TRACK=1` and `AI_SKILLS_TELEMETRY=0` are respected.

## Privacy

Anonymous telemetry is opt-in. Interactive `init` asks once; `--yes`,
CI, and non-TTY runs stay disabled unless `AI_SKILLS_TELEMETRY=1` is
set. Telemetry is sent only when a PostHog project key is configured.

Telemetry never sends secrets, absolute paths, file contents, registry
URLs, Git remotes, raw command arguments, user names, host names, raw
error messages, or stack traces. See [docs/telemetry.md](docs/telemetry.md)
for the full schema and controls.

## What Is Included

- [skills/](skills/) — Claude Code skills:
  `grill-me`, `convince-me`, `weak-spots`, `steelman`, `pre-mortem`.
- [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), and [GEMINI.md](GEMINI.md)
  — shared instructions for different agents.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) and
  [.cursor/rules/000-index.mdc](.cursor/rules/000-index.mdc) — native
  Copilot and Cursor entry points.
- [instructions/](instructions/), [prompts/](prompts/), and [stacks/](stacks/)
  — reusable guidance, prompt templates, and stack-specific conventions.
- [manifest.json](manifest.json) and [cli/](cli/) — the multi-tool installer.

## Root Files

Some files stay at the project root on purpose because tools look for
them there:

- `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
- `README.md`, `LICENSE`, and `manifest.json`.
- `.claude-plugin/`, `.claude/`, `.cursor/`, `.github/`, and `.vscode/`.
- `skills/`, `instructions/`, `prompts/`, and `stacks/`, because the
  model-facing docs and installer manifests point at those paths.

> **VS Code is the primary target environment** for the config folders
> listed above. The `.github/` folder is read by the
> [GitHub Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
> (GitHub/Microsoft); `.claude/` by the
> [Claude Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
> (Anthropic); `.cursor/` by [Cursor](https://www.cursor.com/)
> (Anysphere — a VS Code fork, not a VS Code extension). `AGENTS.md`,
> `CLAUDE.md`, and `GEMINI.md` are additionally read by their
> respective CLI tools outside VS Code.

## Other Ways To Consume

- **Bootstrap:** copy a snapshot into a project with
  [bootstrap/install.sh](bootstrap/install.sh).
- **Submodule:** pin this repo in a project and update it deliberately.

See [docs/sync-strategies.md](docs/sync-strategies.md) for the tradeoffs.

## Tool Guides

- [Claude Code](docs/using-with-claude-code.md)
- [Codex](docs/using-with-codex.md)
- [Cursor](docs/using-with-cursor.md)
- [GitHub Copilot](docs/using-with-copilot.md)
- [Gemini CLI](docs/using-with-gemini-cli.md)
- [Windsurf](docs/using-with-windsurf.md)
- [Ollama](docs/using-with-ollama.md)

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
