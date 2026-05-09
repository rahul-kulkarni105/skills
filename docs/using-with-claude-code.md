---
name: using-with-claude-code
description: Wiring this repo into Claude Code — entry file, skills, settings, verification.
last_reviewed: 2026-05-09
---

# Using with Claude Code

Claude Code reads `CLAUDE.md` from the project root and discovers
skills under `skills/` by their frontmatter `description`.

## Entry file

[../CLAUDE.md](../CLAUDE.md) is the project memory. It points to
[../AGENTS.md](../AGENTS.md) for universal rules and to
[../instructions/context/claude.md](../instructions/context/claude.md)
for Claude-specific tactics (subagent selection, `/compact`
thresholds, parallel tool calls, `Read` defaults).

Personal preferences belong in `~/.claude/CLAUDE.md`, not in the
project file.

## Skills

The five seeded adversarial skills live under [../skills/](../skills/).
Run `/skills` in Claude Code to confirm they are discoverable. The
template at [../skills/_template/SKILL.md](../skills/_template/SKILL.md)
is the starting point for a new skill — copy it, edit the
frontmatter, fill in the body. Keep skill bodies under ~500 lines.

Promotion: a recurring pattern becomes a skill only after the
**Rule of 3**.

## Project-scoped settings

[../.claude/settings.json](../.claude/settings.json) holds the
project-scoped Claude settings. It is intentionally minimal — no
destructive permissions, no personal preferences. Subjective
defaults (tone, statusline, model selection) go in
`~/.claude/settings.json`.

## Slash commands

Project-scoped slash commands live under
[../.claude/commands/](../.claude/commands/). Empty at scaffold.
When you find yourself running the same multi-step prompt three
times, write a slash command for it.

## Verification

1. Open the repo in Claude Code.
2. Ask any project question — confirm `CLAUDE.md` appears in the
   loaded context.
3. Run `/skills` — confirm the template + 5 adversarial skills are
   listed.
4. Pitch a deliberately-flawed plan — confirm the AI grills it
   before agreeing (adversarial default).
5. Ask a question that needs clarification — confirm the AI uses
   `AskUserQuestion`, not plain prose.

## See also

- [tool-matrix.md](tool-matrix.md)
- [../instructions/context/claude.md](../instructions/context/claude.md)
- [../skills/README.md](../skills/README.md)
