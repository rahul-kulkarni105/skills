---
name: prompts
description: Tool-agnostic, copy-pasteable prompt templates. Lives outside skills/ because not every tool has Claude's auto-discovery.
last_reviewed: 2026-05-09
---

# Prompts

Tool-agnostic, copy-pasteable prompts. Use these in any AI coding
assistant by pasting the template into chat and filling in the
placeholders.

## Format

Each prompt is a single Markdown file with frontmatter:

```
---
name: <kebab-case-name>
description: <one line — when to reach for this prompt>
last_reviewed: YYYY-MM-DD
---
```

Body sections:

- **When to use** — concrete triggers.
- **Prompt** — the template, with `<placeholders>` to fill in.
- **Notes** — caveats, follow-ups.

## When a prompt becomes a skill

Apply the **Rule of 3** (see [../skills/README.md](../skills/README.md)):
once you've reached for the same prompt three times, promote it to a
skill. Until then, keep it here.

## Seed content

None at scaffold time — prompts are added when friction surfaces, not
pre-emptively. See [../docs/working-with-ai.md](../docs/working-with-ai.md)
on the opportunistic update cadence.
