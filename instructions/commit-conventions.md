---
name: commit-conventions
description: Conventional Commits format and project-level commit rules.
last_reviewed: 2026-05-09
---

# Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<body — optional>

<footer — optional>
```

## Types

`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`.

## Rules

- Summary in imperative mood, lowercase, no trailing period, ≤72 chars.
- Body explains the **why**, not the **what**. Wrap at ~80 cols.
- One logical change per commit. If you can't summarise it in one
  sentence, split it.
- Reference issues in the footer: `Refs #123`, `Closes #123`.
- Never `git commit --amend` published commits. Create a new commit and
  let the reviewer follow the trail.
- Never use `--no-verify` to skip hooks unless the user explicitly asks.

## Co-authoring

When AI assists, append a single trailer line:

```
Co-Authored-By: <Model name> <noreply@anthropic.com>
```

Only when the AI materially contributed to the commit.
