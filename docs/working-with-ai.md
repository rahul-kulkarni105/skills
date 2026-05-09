---
name: working-with-ai
description: Meta — who this repo is for, the success metric, decay, precedence, and the kill switch.
last_reviewed: 2026-05-09
---

# Working with AI

The meta document. Read this if you are unsure why this repo exists,
who it serves, or how to decide what belongs in it.

## Who this is for

The **AI assistant** is the primary reader. Files are written so an
LLM can consume them mid-task and act on them without further
prompting. A human can skim them as a side-effect; that is not the
optimisation target.

The user is a single developer who works across multiple AI tools
(Claude Code, Copilot, Codex, Gemini CLI, Cursor, Windsurf) and
multiple stacks (TS/JS, React ecosystem, AWS, Terraform, Cloudflare,
Vercel, Node, Vite, Vitest, RTL, etc.). They want consistent agent
behaviour without re-prompting in every conversation.

## What this repo is

Code-free, document-only. No `package.json`, no build, no tests.
Every file is markdown that an AI tool reads on conversation start
or on demand.

## What this repo is not

- Not a runtime. There is nothing to install or run.
- Not a personal scratchpad. Personal/subjective preferences belong
  in the user's global config (`~/.claude/CLAUDE.md`,
  `~/.codex/AGENTS.md`, etc.) — not here.
- Not a documentation site for a product. Tool-specific docs live
  upstream; this repo links to them.

## Success metric

The AI follows the conventions in this repo **without the user
having to prompt for them**. Specifically:

- It uses native question UI (`AskUserQuestion`, etc.) for
  clarifications instead of plain prose.
- It defaults to challenging assumptions before agreeing with a
  plan.
- It respects token & context discipline (Grep before Read, batch
  parallel calls, no re-reading after edits).
- It picks up project conventions (commit style, PR style, testing
  approach) from the relevant `instructions/` and `stacks/` files.

If the user has to ask "please use AskUserQuestion" in a
conversation, the conventions are not loaded correctly — fix the
loading, not the user's prompt.

## Boundaries

| Belongs in this repo | Belongs in user's global config |
|---|---|
| Conventions (commits, PRs, testing) | Personal tone preferences ("be terse") |
| Stack guidance (React, AWS, Terraform) | Personal aliases, shortcuts |
| Adversarial skills | Habits the user has formed individually |
| Token & context discipline | Statusline, theme, model defaults |

The line: **shareable / objective → repo. Personal / subjective →
global.**

## Skill promotion: Rule of 3

A recurring prompt becomes a skill only after the same pattern is
needed three times. One-off prompts go in
[../prompts/](../prompts/). Twice-seen prompts are still prompts.
Three times → promote to a skill in [../skills/](../skills/).

The same threshold applies to per-tech files inside
[../stacks/](../stacks/). Domain READMEs at scaffold; per-tech files
when real content exists three times over.

## Conflict precedence

Project wins. When this repo is imported into a consumer project,
the project's own `AGENTS.md` / `CLAUDE.md` / `.cursor/rules/` files
override anything here. AGENTS.md and CLAUDE.md state this
explicitly so consumers know they can override without forking.

## Decay

Every content file carries `last_reviewed: YYYY-MM-DD` frontmatter.
After 6 months, the AI surfaces a "may be stale" banner when it
reads the file. There is no CI; the convention is that the AI is
honest about staleness when it loads a file, and the user (or AI)
bumps the date when content is reviewed.

## Update cadence

Opportunistic. Update when friction surfaces in real work, not on a
schedule. A fixed cadence creates stale-by-default content; surfaces
of friction are honest signal.

## Kill switch — 3-month checkpoint

**Review date: 2026-08-08.** Three months from initial scaffold.

At the checkpoint, audit:

- Which files were actually read during the period?
- Which skills were triggered?
- Which prompts were used?
- Which stack files have been added or grown?

Files and skills that were neither used nor useful get pruned.
Better to delete than to let the repo accrete.

## Why this matters

The trap with AI configuration is the same trap as with any
configuration: it grows by accretion, nothing gets removed, and over
time the average rule is wrong. The remedies — `last_reviewed:`
banners, the Rule of 3, the 3-month kill switch, project-wins
precedence — exist to keep this repo small, useful, and trustworthy.

If a rule isn't working, delete it. If a skill isn't firing,
delete it. If a stack file is wrong, fix it now.

## See also

- [architecture.md](architecture.md) — how files compose at runtime.
- [style-guide.md](style-guide.md) — what makes a good file.
- [contributing.md](contributing.md) — how to change things.
