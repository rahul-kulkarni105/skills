---
name: contributing
description: Workflow for adding, changing, or pruning files in this repo.
last_reviewed: 2026-05-09
---

# Contributing

This repo is small on purpose. The goal is to keep it that way.

## Before you add a file

Ask:

1. **Does this rule apply on every prompt?** → `instructions/`.
2. **Is it a task template the user will invoke?** → `prompts/`.
3. **Should Claude discover it by description match?** → `skills/`
   (only after Rule of 3).
4. **Is it stack-specific guidance with real content?** →
   `stacks/<domain>/<tech>.md` (only after Rule of 3 for the tech).
5. **Is it meta documentation about this repo?** → `docs/`.

If the answer is "I'm not sure" — wait. Friction will tell you
where it belongs.

## Frontmatter

Every content file gets:

```yaml
---
name: short-kebab-name
description: One specific sentence — this is what the AI matches on.
last_reviewed: YYYY-MM-DD
---
```

`SKILL.md` files follow the
[anthropics/skills](https://github.com/anthropics/skills) spec.

See [style-guide.md](style-guide.md) for voice, length, and
density rules.

## When you change AGENTS.md

[../AGENTS.md](../AGENTS.md) and
[../.github/copilot-instructions.md](../.github/copilot-instructions.md)
share core content. Copilot has no `@import` support, so the mirror
is manual.

**When you change AGENTS.md, mirror the change in
copilot-instructions.md in the same commit.** No exceptions until
we automate it.

A generator script is explicitly out of scope for v0. If the
mirror starts drifting, that's the signal to add automation.

## When you change instructions

If the rule applies on every prompt, AGENTS.md should reference the
file. Confirm:

- AGENTS.md links to it.
- The Copilot mirror reflects it (if universal).
- The relevant `instructions/context/<tool>.md` is consistent.

## When you change a skill

- Bump `last_reviewed:`.
- Keep the body under ~500 lines.
- Re-read the `description:` — is it still the right match string?

## When you delete

Deleting is good. The kill-switch checkpoint
([working-with-ai.md](working-with-ai.md)) exists so we delete
on a schedule. But you don't need to wait for it: if a file is
wrong, prune it now.

When you delete:

- Remove all references (search the repo for the filename).
- Update the parent README's index.
- If it was referenced from AGENTS.md, update AGENTS.md and the
  Copilot mirror.

## Commit and PR style

See [../instructions/commit-conventions.md](../instructions/commit-conventions.md)
and [../instructions/pr-conventions.md](../instructions/pr-conventions.md).

## Verifying after changes

Walk the directory tree, confirm every README renders cleanly, no
broken cross-links, and `tool-matrix.md` matches each tool's
current docs.

## See also

- [architecture.md](architecture.md)
- [style-guide.md](style-guide.md)
- [working-with-ai.md](working-with-ai.md)
