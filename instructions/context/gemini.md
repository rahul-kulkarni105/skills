---
name: context-gemini
description: Gemini CLI-specific context tactics. Token caching, /memory, @import discipline.
last_reviewed: 2026-05-09
---

# Gemini CLI — context tactics

Universal rules in
[../context-and-token-discipline.md](../context-and-token-discipline.md)
apply first. The points below are Gemini-specific.

## GEMINI.md & `@import`

- `GEMINI.md` is the project's entry file for Gemini CLI.
- Use `@<path>` to import other files. This repo's `GEMINI.md` is a
  thin shim that imports `AGENTS.md` and `instructions/context/gemini.md`.
- Gemini follows `@imports` recursively — don't create cycles.
- Imports are **inlined** at load time. Bigger imports = more tokens.

## Token caching

- Gemini caches the system prompt + early conversation. Long-lived
  sessions get cheaper after the first turn.
- A long `GEMINI.md` is paid for once per session, not per turn — but
  it still counts against the context window.
- If you swap branches or projects, the cache is invalidated. Expect
  the first turn to be slower.

## `/memory` commands

| Command | Effect |
|---|---|
| `/memory show` | Print the loaded memory chain (great for debugging) |
| `/memory refresh` | Re-read all `GEMINI.md` files |
| `/memory add <text>` | Append a fact to user-scoped memory |

Use `/memory show` to confirm `AGENTS.md` and the per-tool context
file actually loaded. If they don't appear, the import path is wrong.

## Hierarchy

Gemini composes memory from:

1. `~/.gemini/GEMINI.md` (user, global).
2. Each `GEMINI.md` walking up from cwd to repo root.
3. Sub-tree `GEMINI.md` files for the active path.

Lower (more specific) layers override higher.

## MCP servers

- MCP servers configured in `~/.gemini/settings.json` add tools to
  every session. Each adds a fixed token cost.
- Gate MCP servers per-project rather than enabling everything
  globally. Disable ones the current project doesn't need.

## Tool use

- Gemini's shell tool is gated by approval. Pre-approve the safe
  commands you use often (`git status`, `rg`, `ls`).
- Search: prefer `rg` over `grep`; use `Glob` for filename patterns.
