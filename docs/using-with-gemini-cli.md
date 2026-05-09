---
name: using-with-gemini-cli
description: Wiring this repo into Gemini CLI — GEMINI.md imports, /memory, verification.
last_reviewed: 2026-05-09
---

# Using with Gemini CLI

Gemini CLI reads `GEMINI.md` from the project root and supports
`@<path>` imports.

## Entry file

[../GEMINI.md](../GEMINI.md) is a thin shim:

- `@AGENTS.md` — imports the universal rules.
- `@instructions/context/gemini.md` — imports per-tool tactics.

Keeping GEMINI.md tiny lets the import graph carry the content;
nothing duplicates.

## /memory commands

| Command | What it does |
|---|---|
| `/memory show` | Print what the model has loaded. |
| `/memory refresh` | Re-read the GEMINI.md graph. |
| `/memory add <text>` | Append a fact to the active session. |

`add` is for ephemeral session facts. Anything durable goes into a
file under [../instructions/](../instructions/), not `/memory add`.

## Token caching

Gemini caches tokens between turns. Stable, slow-changing files
(AGENTS.md, instructions) ride the cache. Volatile content (active
file selections) shouldn't be pulled in via `@import`.

## Per-tool tactics

[../instructions/context/gemini.md](../instructions/context/gemini.md)
covers `@import` discipline, MCP server gating, and
`/memory show|refresh|add`.

## Verification

1. Run `gemini` in the repo root.
2. Run `/memory show` — confirm `AGENTS.md` and
   `instructions/context/gemini.md` appear via `GEMINI.md`'s
   imports.
3. Ask a clarification-worthy question — confirm Gemini uses its
   inline question UI rather than plain prose.

## See also

- [tool-matrix.md](tool-matrix.md)
- [../instructions/context/gemini.md](../instructions/context/gemini.md)
- [../GEMINI.md](../GEMINI.md)
