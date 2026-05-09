---
name: context-windsurf
description: Windsurf-specific context tactics. Cascade memory, .windsurfrules, Flow vs Chat.
last_reviewed: 2026-05-09
---

# Windsurf — context tactics

Universal rules in
[../context-and-token-discipline.md](../context-and-token-discipline.md)
apply first. The points below are Windsurf-specific.

## `.windsurfrules` & AGENTS.md

- Windsurf reads `AGENTS.md` natively (per the open standard).
- Legacy `.windsurfrules` is still respected. Prefer `AGENTS.md` and
  keep `.windsurfrules` minimal (or absent) to avoid drift.

## Cascade memory

Cascade builds session memory as you work. Two places for persistent
rules:

1. **Project memory** — visible to anyone using this repo.
2. **User memory** — personal, cross-project.

Same boundary as the rest of this repo: shareable/objective →
project; personal/subjective → user memory.

`/memory` lists what Cascade currently has loaded. Use it before a
long task to confirm the right rules are in.

## Flow vs Chat

| Mode | When |
|---|---|
| Chat | Single-turn Q&A or scoped edit |
| Flow / Cascade | Multi-step agentic task with planning + iteration |

Flow mode iterates and edits. Give explicit acceptance criteria so it
knows when to stop.

## Context inclusions

- Cascade auto-pulls open files and recent edits. Close unrelated
  files before starting a focused task.
- Pin important files to the context to keep them in scope across
  turns.

## Limits

- Long Flow runs accumulate context fast. Compact / restart when the
  agent starts repeating itself or losing track.
- Windsurf's MCP support is comparable to Claude/Gemini — same
  discipline applies: enable per-project, not globally.
