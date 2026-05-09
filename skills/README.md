---
name: skills
description: Claude Code Agent Skills directory. Each skill is a SKILL.md with name + description frontmatter.
last_reviewed: 2026-05-09
---

# Skills

Claude Code auto-discovers Agent Skills under this directory. Each skill
is a folder containing a `SKILL.md` with `name` + `description`
frontmatter; Claude reads the description to decide when to activate.

Spec: [anthropics/skills](https://github.com/anthropics/skills).

## Format

```
skills/<skill-name>/SKILL.md
```

`SKILL.md` frontmatter:

- `name` — short identifier (kebab-case).
- `description` — one or two sentences. **This is the only thing the
  model sees until activation.** Be precise about *when* the skill
  applies and *what* it produces.

Body: trigger conditions, the stance to take, the procedure, example
openers. Keep skills under ~500 lines (see token discipline rules).

## Promotion rule

A recurring prompt becomes a skill **only after the Rule of 3** — the
same pattern needed three times. Below the threshold, keep it as a
prompt under [../prompts/](../prompts/).

## Seeded skills

Adversarial suite, cross-cutting (not stack-specific):

- [`grill-me`](grill-me/SKILL.md) — aggressively challenge the user's
  plan/idea.
- [`convince-me`](convince-me/SKILL.md) — force the user to justify
  their choice.
- [`weak-spots`](weak-spots/SKILL.md) — enumerate failure modes and
  blind spots.
- [`steelman`](steelman/SKILL.md) — best-case version of the opposing
  view.
- [`pre-mortem`](pre-mortem/SKILL.md) — imagine this shipped and failed
  — why?

To start a new skill, copy [`_template/SKILL.md`](_template/SKILL.md).

## Other tools

Codex, Gemini CLI, Cursor, Windsurf, and Copilot don't have an
equivalent native auto-discovery mechanism. For those tools, the same
patterns are exposed as prompts under [../prompts/](../prompts/) once
they're written. See [../docs/tool-matrix.md](../docs/tool-matrix.md).
