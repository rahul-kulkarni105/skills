---
name: using-with-windsurf
description: Wiring this repo into Windsurf — AGENTS.md, Cascade memory, verification.
last_reviewed: 2026-05-09
---

# Using with Windsurf

Windsurf reads `AGENTS.md` natively (it joined the open standard).
Legacy projects may still use `.windsurfrules`.

## Entry file

[../AGENTS.md](../AGENTS.md). No shim needed — Windsurf reads it
directly.

If a project still has a `.windsurfrules` file, treat it as legacy
and migrate the contents into `AGENTS.md`. Don't deepen the
`.windsurfrules` dependency.

## Cascade memory

Windsurf's Cascade memory comes in two scopes:

| Scope | Use for |
|---|---|
| Project | Conventions, decisions specific to this codebase |
| User | Personal habits across all codebases |

Anything that belongs in this repo goes through `AGENTS.md`, not
Cascade memory. Cascade memory is for ephemeral / session-specific
notes.

## Flow vs Chat

| Mode | When to use |
|---|---|
| Flow (agent) | Multi-step tasks with tool use |
| Chat | Q&A, planning, code review |

Same rules apply across modes.

## Per-tool tactics

[../instructions/context/windsurf.md](../instructions/context/windsurf.md)
covers AGENTS.md vs `.windsurfrules`, Cascade memory scopes, Flow vs
Chat, pinned context, and MCP per-project gating.

## Verification

1. Open the repo in Windsurf.
2. Ask any project question — confirm `AGENTS.md` appears in the
   loaded context.
3. Pitch a deliberately-flawed plan — confirm the adversarial
   default surfaces.
4. Ask a clarification-worthy question — confirm Windsurf uses its
   inline question UI.

## See also

- [tool-matrix.md](tool-matrix.md)
- [../instructions/context/windsurf.md](../instructions/context/windsurf.md)
- [../AGENTS.md](../AGENTS.md)
