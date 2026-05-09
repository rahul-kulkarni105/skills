---
name: context-and-token-discipline
description: Strict, measurable rules for how the AI should use tools and manage context. Loaded on every prompt across every tool.
last_reviewed: 2026-05-09
---

# Context & token discipline

These rules apply to **every** AI assistant working in this repo or in
projects that import it. They are strict and measurable so the AI can
self-audit. Tool-specific tactics live in [context/](context/).

## Search before read

1. Use **Grep / Glob** before **Read** when locating a symbol, string,
   or file by pattern. Read whole files only after the location is
   known.
2. For broad codebase exploration likely to take **>3 queries**,
   delegate to a search subagent (Claude's `Explore`, Cursor's
   `@Codebase`, etc.). Otherwise inline.
3. Don't `Read` a directory listing — use `Glob` or shell `ls`.

## Reading files

4. For files **>500 lines**, pass `offset` and `limit` (or the
   tool-equivalent). Never read past line **2000** in a single call.
5. Read only the section you need. If line numbers are known, read
   ±50 lines around them.
6. **Never re-read a file you just edited.** The harness already
   tracks the change. Trust the edit result.

## Editing files

7. Prefer `Edit` (string replacement) over `Write` for existing files.
   `Write` is for new files or full rewrites only.
8. Read a file at least once before editing it. Most tools require
   this.
9. Batch multiple edits to the same file into a single call when the
   tool supports `replace_all` or multi-edit.

## Parallelism

10. Batch independent tool calls into a **single message**. Sequential
    calls are reserved for genuine data dependencies.
11. Examples to parallelise: `git status` + `git diff` + `git log`;
    multiple `Grep` patterns; reads of unrelated files.

## Output handling

12. Don't paste large tool output back into responses. Summarise and
    quote only the lines that matter.
13. End-of-turn summary: 1–2 sentences. What changed, what's next. No
    recap of every step.
14. Don't narrate internal deliberation. State results.

## Memory budget

15. Keep `AGENTS.md` and any tool-native entry file (`CLAUDE.md`,
    `GEMINI.md`, `.github/copilot-instructions.md`,
    `.cursor/rules/000-index.mdc`) under **~3k tokens combined**. Push
    detail into linked instruction files.
16. Skill `description` frontmatter is the only field the model sees
    until activation. Keep descriptions precise and specific. Keep
    skill bodies under **~500 lines**.
17. If a single instruction file grows past ~300 lines, split it.

## Compaction & context resets

18. When context fills, prefer compaction (Claude `/compact`, Gemini
    `/memory refresh`, etc.) over starting over. Save key state to a
    plan or memory file first.
19. Before compaction, write down: the current goal, the current
    blocker, the next 2 actions.

## Anti-patterns

- Reading the same file twice in one turn.
- Greping for something you've already located.
- Sequential tool calls where the inputs are independent.
- Re-reading a file after an `Edit` "to confirm".
- Pasting >50 lines of tool output into a user-facing reply.
- Loading a stack file unrelated to the current task.

## Self-audit prompt

At the end of a non-trivial task, ask yourself: *"How many tool calls
did I make, and how many were strictly necessary?"* If the answer is
"more than I needed", note the pattern in
[../docs/working-with-ai.md](../docs/working-with-ai.md) so the next
session is leaner.
