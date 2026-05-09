---
name: style-guide
description: Quality bar for files in this repo and the canonical-file rule.
last_reviewed: 2026-05-09
---

# Style guide

Files here are written for an LLM first, a human second. Optimise
for fast retrieval and unambiguous instruction.

## Frontmatter

Every content file begins with YAML frontmatter:

```yaml
---
name: short-kebab-name
description: One sentence; this is what the AI matches on.
last_reviewed: YYYY-MM-DD
---
```

For `SKILL.md` files, the spec is stricter — see
[anthropics/skills](https://github.com/anthropics/skills). `name` and
`description` are mandatory; the description is the only thing the
model sees until activation, so make it precise.

## `last_reviewed:` and the staleness banner

Every content file carries `last_reviewed: YYYY-MM-DD`. After 6
months, the AI surfaces a "may be stale" banner when it reads the
file — a documented convention. There is no CI enforcement at v0.

When you touch a file substantively, bump the date. Trivial edits
(typo fix, link repair) do not require a bump.

## Headings, length, density

- One `#` H1 per file (the title), then `##` for top-level sections.
- Short sections beat long ones. Aim for sections under ~30 lines.
- No clever prose. Tables and bullets compress better than
  paragraphs.
- Avoid filler ("It's important to note that…", "Furthermore…").
- If a section starts to grow past ~80 lines, split it into its own
  file and link.

## Voice

- Prescriptive. State the rule, then the reason. Avoid hedging.
- Imperative for actions: "Use Grep before Read", not "You should
  use Grep before Read".
- Concrete and measurable. "Read with offset/limit when files
  exceed 500 lines" beats "Read large files carefully".

## instructions vs. prompts vs. skills

Same content lives in **exactly one** canonical file. Pick the bucket
by how the content is used:

| Bucket | Triggered by | Format |
|---|---|---|
| `instructions/` | **Always** — composed into AGENTS.md / CLAUDE.md | Plain markdown with frontmatter |
| `prompts/` | **User pastes / invokes** | Plain markdown, copy-pasteable |
| `skills/` | **Claude matches `description` to task** | `SKILL.md` (anthropics spec) |

If a rule applies on every prompt, it's an **instruction**. If it's
a task template the user invokes ("write a Vitest suite for X"), it's
a **prompt**. If it's a discoverable specialty Claude should reach
for when context matches, it's a **skill**.

The **Rule of 3**: a recurring prompt becomes a skill only after the
same pattern is needed three times.

## Cross-linking

- Every file links to its siblings (the README in the same directory).
- Every README lists the files in its directory and links to each.
- Cross-references between domains use repo-relative paths
  (`../instructions/...`).
- Avoid deep links into other tools' external docs unless the link
  targets a versioned section. Prefer linking the doc root.

## Anti-patterns

- A file with no `last_reviewed:` — invisible to the staleness
  convention.
- A `description:` that is generic ("Notes on testing"). The
  description is matched against tasks; make it specific.
- Paragraphs that summarise rather than instruct.
- Examples without context. If you include a code block, say what
  it demonstrates and when to use it.
- Duplicating content across files instead of linking. Exceptions:
  the documented Copilot mirror.

## Adding a new file

1. Pick the bucket (`instructions/`, `prompts/`, `skills/`,
   `stacks/<domain>/`, `docs/`).
2. Start from a sibling file and copy its shape.
3. Frontmatter first, then the file.
4. Update the bucket README's index.
5. If it changes anything universal, also update AGENTS.md and the
   Copilot mirror.

## See also

- [architecture.md](architecture.md) — why this layout.
- [contributing.md](contributing.md) — workflow for changes.
- [working-with-ai.md](working-with-ai.md) — meta principles.
