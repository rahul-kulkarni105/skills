---
name: CLAUDE.md
description: Claude Code project memory — entry point that delegates to AGENTS.md and Claude-specific tactics.
last_reviewed: 2026-05-08
---

# CLAUDE.md

Project memory for **Claude Code** in this repository.

> **Precedence.** Consumer project config wins. Treat everything below
> as a default. Personal preferences belong in `~/.claude/CLAUDE.md`,
> not here.

## Read first

- [AGENTS.md](AGENTS.md) — universal rules: interaction style,
  adversarial default, tone, commits, PRs, secrets, quality bar, **token
  & context discipline**.
- [instructions/context/claude.md](instructions/context/claude.md) —
  Claude-specific tactics: subagent selection, `/compact` thresholds,
  skills lazy-loading, parallel tool-call patterns, `Read`
  offset/limit defaults.

## Skills

Claude Code auto-discovers skills under [skills/](skills/) by their
`description` frontmatter. Seeded adversarial suite:

- [`grill-me`](skills/grill-me/SKILL.md) — challenge a plan/idea.
- [`convince-me`](skills/convince-me/SKILL.md) — force the user to
  justify their choice.
- [`weak-spots`](skills/weak-spots/SKILL.md) — enumerate failure modes
  and blind spots.
- [`steelman`](skills/steelman/SKILL.md) — best-case version of the
  opposing view.
- [`pre-mortem`](skills/pre-mortem/SKILL.md) — imagine this shipped and
  failed; explain why.

The promotion rule: a recurring prompt becomes a skill only after the
**Rule of 3** — the same pattern needed three times.

## Project-scoped settings

[`.claude/settings.json`](.claude/settings.json) holds project-scoped
Claude settings. Personal/subjective preferences go in
`~/.claude/settings.json`, not the project file.

## Tone, length, output

Defer to [AGENTS.md](AGENTS.md) and
[instructions/tone-and-style.md](instructions/tone-and-style.md). Use
`AskUserQuestion` for clarifications — never plain prose questions.

## When in doubt

Surface uncertainty before acting. Default to grilling a plan rather
than agreeing with it. See
[instructions/adversarial-default.md](instructions/adversarial-default.md).
