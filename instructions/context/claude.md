---
name: context-claude
description: Claude Code-specific context tactics. Subagents, /compact, skills, Read defaults.
last_reviewed: 2026-05-09
---

# Claude Code — context tactics

Universal rules in
[../context-and-token-discipline.md](../context-and-token-discipline.md)
apply first. The points below are Claude-specific.

## Subagent selection

| Use | When |
|---|---|
| `Explore` | Read-only search across many files. Locate symbols, find files by pattern, "where is X defined?" |
| `Plan` | Design an implementation plan for a non-trivial change. Returns step-by-step plan + critical files. |
| `general-purpose` | Multi-step research or task execution that needs both reading and editing. |

Rule of thumb: if a task will need **>3 search queries**, dispatch
`Explore`. If you've already located the code and just need to edit,
inline with `Grep` + `Read` + `Edit`.

Don't spawn a subagent for a task you can do in 1–2 tool calls. Each
spawn pays a cold-start context cost.

## `/compact` discipline

- Run `/compact` proactively when context use crosses **~70%** of the
  window. Don't wait for the warning.
- Before `/compact`, write the current state into a plan or a memory
  file under
  `~/.claude/projects/<project>/memory/`.

## Skills lazy-loading

- Claude only sees a skill's `description` frontmatter until the skill
  is invoked.
- Therefore: descriptions must be **specific and trigger-rich**. Bad:
  "Helps with code review." Good: "Use when the user asks to audit a
  plan, design, or PR for failure modes, blind spots, or weak
  assumptions."
- Bodies under ~500 lines. Long skills get split.

## `Read` defaults

- Files >500 lines → use `offset` + `limit`.
- Never `Read` past line 2000 in a single call.
- Don't re-read after `Edit` / `Write`. The harness already tracked
  the change.

## Parallel tool calls

- Independent tool calls → single message with multiple tool blocks.
- The classic batch: `git status` + `git diff` + `git log`.
- Multiple `Grep` patterns for the same task → parallelise.

## Hooks & settings

- Project-scoped permissions live in
  [`.claude/settings.json`](../../.claude/settings.json). Personal
  preferences belong in `~/.claude/settings.json`.
- Hooks (PreToolUse, PostToolUse) can enforce rules but they fire on
  every call — keep them fast.

## Plan mode

- Use plan mode (`EnterPlanMode`) for any change touching >3 files or
  with non-obvious trade-offs. The plan file persists across sessions.
- Plans are not memory. Don't store user preferences in a plan.
