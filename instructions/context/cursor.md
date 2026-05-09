---
name: context-cursor
description: Cursor-specific context tactics. MDC frontmatter, glob scoping, @Codebase discipline.
last_reviewed: 2026-05-09
---

# Cursor — context tactics

Universal rules in
[../context-and-token-discipline.md](../context-and-token-discipline.md)
apply first. The points below are Cursor-specific.

## `.cursor/rules/*.mdc`

Each MDC file has frontmatter:

```
---
description: <one line — when to apply this rule>
globs: <comma-separated paths the rule applies to>
alwaysApply: true | false
---
```

- `alwaysApply: true` → the rule loads on every prompt.
- `globs: src/**/*.{ts,tsx}` → the rule loads only when the active
  file matches.
- `description` is shown to the model when `alwaysApply: false` so it
  can decide whether to pull the rule in.

## This repo's setup

[`.cursor/rules/000-index.mdc`](../../.cursor/rules/000-index.mdc) is
the entry rule (`alwaysApply: true`). It references `AGENTS.md` and
this file. Add narrower MDC rules with globs as the project grows —
e.g. `react-rules.mdc` scoped to `src/**/*.tsx`.

## `alwaysApply` discipline

- One `alwaysApply: true` rule is plenty. Multiple "always" rules add
  up fast in token cost.
- Anything stack- or path-specific should be `alwaysApply: false` with
  a `globs` filter or a `description` that the model can match.

## `@Codebase` discipline

- `@Codebase <query>` searches the indexed repo. Use it for "where is
  X defined?" not for whole-repo dumps.
- Index updates lag edits — if a recent file isn't found, re-index.
- Don't `@Codebase` for things you can `Grep` faster.

## Project rules vs user rules

| Rule type | Path | Scope |
|---|---|---|
| Project | `.cursor/rules/*.mdc` | This repo, shareable, committed |
| User | Cursor settings → Rules | Personal, all projects |

Personal/subjective preferences ("I prefer terse explanations") go in
**user rules**, not this repo's project rules.

## Modes

| Mode | When |
|---|---|
| Chat | Q&A, no edits |
| Edit | Apply a single, scoped change |
| Agent | Multi-step task; will plan + iterate |

Agent mode reads `AGENTS.md` via the standard. Confirm by asking a
project question and watching the references panel.

## Models

- Claude / GPT / Gemini selectable per request. Match model to task:
  big refactors → frontier model; rote edits → cheaper/faster.
