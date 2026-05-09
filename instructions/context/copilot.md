---
name: context-copilot
description: GitHub Copilot-specific context tactics. Instructions size, content exclusions, agent mode.
last_reviewed: 2026-05-09
---

# GitHub Copilot — context tactics

Universal rules in
[../context-and-token-discipline.md](../context-and-token-discipline.md)
apply first. The points below are Copilot-specific.

## `.github/copilot-instructions.md`

- The single project-scoped instruction file Copilot reads natively.
- **Size cap: ~600 words** (Copilot truncates beyond ~6k chars in
  practice). Keep it terse.
- **No `@import` support.** This repo manually mirrors AGENTS.md core
  rules into `.github/copilot-instructions.md`. Sync rule documented
  in [../../docs/architecture.md](../../docs/architecture.md).

## VS Code settings

In [`.vscode/settings.json`](../../.vscode/settings.json):

```json
{
  "github.copilot.chat.codeGeneration.useInstructionFiles": true,
  "github.copilot.chat.codeGeneration.instructions": [
    { "file": "instructions/code-quality-bar.md" },
    { "file": "instructions/tone-and-style.md" }
  ],
  "github.copilot.chat.commitMessageGeneration.instructions": [
    { "file": "instructions/commit-conventions.md" }
  ],
  "github.copilot.chat.pullRequestDescriptionGeneration.instructions": [
    { "file": "instructions/pr-conventions.md" }
  ]
}
```

These keep specialised instructions out of the main file but still let
Copilot pick them up.

## Content exclusions

Configure at `https://github.com/<org>/settings/copilot/exclusions` for
the org or in repo settings. Exclude:

- `*.env`, `*.env.*`, `*.pem`, `*.key`, `id_rsa*`.
- `**/node_modules/**`, `dist/**`, `build/**`, `coverage/**`,
  `.next/**`, `.turbo/**`, `.cache/**`.
- Lockfiles: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`,
  `bun.lockb`.
- Internal-only directories with proprietary data.

VS Code workspace also has `search.exclude` and `files.watcherExclude`
in [`.vscode/settings.json`](../../.vscode/settings.json) to keep
suggestions lean.

## Agent mode

- Copilot agent mode (preview) reads `AGENTS.md` like Codex does. The
  manual mirror in `.github/copilot-instructions.md` covers
  inline-Chat use cases too.
- For agent mode runs, give explicit acceptance criteria. It will
  iterate until something passes.

## "References" panel

- After any Chat reply, expand "References" to confirm the right
  instruction file was actually loaded.
- If `.github/copilot-instructions.md` isn't listed, check
  `useInstructionFiles` is `true` and the file is committed.

## Limits

- Copilot inline completions don't see custom instructions. Those are
  Chat-only.
- Long instruction files get silently truncated. Measure twice — keep
  it short.
