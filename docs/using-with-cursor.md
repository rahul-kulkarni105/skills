---
name: using-with-cursor
description: Wiring this repo into Cursor — MDC rules, alwaysApply discipline, verification.
last_reviewed: 2026-05-09
---

# Using with Cursor

Cursor reads `.cursor/rules/*.mdc` files. Each MDC file has
frontmatter (`description`, `globs`, `alwaysApply`) and a markdown
body.

## Entry file

[../.cursor/rules/000-index.mdc](../.cursor/rules/000-index.mdc) has
`alwaysApply: true` and references both AGENTS.md and
[../instructions/context/cursor.md](../instructions/context/cursor.md).
The numeric prefix forces ordering: `000-` loads first.

## alwaysApply discipline

One `alwaysApply: true` rule is plenty. Add scoped rules with
`globs:` for stack-specific guidance (e.g. a rule that only
applies to `**/*.test.ts`).

## Modes

| Mode | When to use |
|---|---|
| Chat | Q&A about the codebase, no edits |
| Edit | Targeted file edits with diff preview |
| Agent | Multi-step tasks with tool use |

The same rules apply across all three.

## @Codebase discipline

`@Codebase` pulls in semantically-relevant files. Use it sparingly
— each pull costs context. Prefer `@<file>` for known paths.

## Per-tool tactics

[../instructions/context/cursor.md](../instructions/context/cursor.md)
covers MDC frontmatter, rule scoping, project rules vs user rules,
and per-task model selection.

## Verification

1. Open the repo in Cursor.
2. In Agent mode, ask any project question.
3. Inspect "Rules applied" — confirm `000-index.mdc` is listed.
4. Pitch a deliberately-flawed plan — confirm the adversarial
   default surfaces.
5. Ask a clarification-worthy question — confirm Cursor uses its
   inline question UI.

## See also

- [tool-matrix.md](tool-matrix.md)
- [../instructions/context/cursor.md](../instructions/context/cursor.md)
- [../.cursor/rules/000-index.mdc](../.cursor/rules/000-index.mdc)
