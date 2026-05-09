---
name: using-with-copilot
description: Wiring this repo into GitHub Copilot — instructions file, VS Code settings, verification.
last_reviewed: 2026-05-09
---

# Using with GitHub Copilot

Copilot reads `.github/copilot-instructions.md` from the project
root for Chat and agent mode. There is **no `@import` mechanism**, so
the file mirrors AGENTS.md's core verbatim.

## Entry file

[../.github/copilot-instructions.md](../.github/copilot-instructions.md)
mirrors AGENTS.md's core including the token & context discipline.
The mirror is manual — when you change AGENTS.md, mirror the change
here. Documented in [contributing.md](contributing.md).

Keep this file **under ~600 words.** Copilot truncates large
instruction files.

## VS Code settings

[../.vscode/settings.json](../.vscode/settings.json) configures:

- `github.copilot.chat.codeGeneration.useInstructionFiles: true` —
  makes Copilot pick up the instructions file.
- `github.copilot.chat.codeGeneration.instructions[]` — additional
  inline instructions (kept short).
- `github.copilot.chat.commitMessageGeneration.instructions[]` —
  references [../instructions/commit-conventions.md](../instructions/commit-conventions.md).
- `github.copilot.chat.pullRequestDescriptionGeneration.instructions[]`
  — references [../instructions/pr-conventions.md](../instructions/pr-conventions.md).
- Content-exclusion patterns — keep `node_modules`, lockfiles, build
  artifacts, `.env*` out of Copilot's context.

Inline-completion (ghost text) does **not** read the instructions
file. The file applies to Chat and agent mode.

## Per-tool tactics

[../instructions/context/copilot.md](../instructions/context/copilot.md)
covers the size cap, the settings keys, content exclusions, agent
mode behavior, and the References panel.

## Verification

1. Open the repo in VS Code with Copilot installed.
2. Open Copilot Chat, ask any project question.
3. Expand the **References** panel in the response — confirm
   `.github/copilot-instructions.md` is listed.
4. Ask Copilot to draft a commit message — confirm it follows
   Conventional Commits per
   [../instructions/commit-conventions.md](../instructions/commit-conventions.md).
5. Confirm content-excluded files don't appear in References.

## See also

- [tool-matrix.md](tool-matrix.md)
- [../instructions/context/copilot.md](../instructions/context/copilot.md)
- [../.github/copilot-instructions.md](../.github/copilot-instructions.md)
