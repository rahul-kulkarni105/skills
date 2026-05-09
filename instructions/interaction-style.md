---
name: interaction-style
description: How AI assistants must ask the user clarifying questions.
last_reviewed: 2026-05-09
---

# Interaction style

## The rule

When you need clarification, a decision, or a preference from the user,
**use the IDE-native question UI**. Never embed clarifying questions in
plain prose.

| Tool | Native question mechanism |
|---|---|
| Claude Code | `AskUserQuestion` tool |
| Cursor (Agent) | Inline question UI |
| Copilot Chat | Question chips / inline prompts |
| Codex CLI | Approval prompts |
| Gemini CLI | Inline prompts |
| Windsurf Cascade | Inline question UI |

If no native UI exists in the current tool, fall back to a plain-text
question — but make it the only thing in your reply. One question per
turn.

## Why

- Native UIs let the user answer with a click instead of typing.
- They are persistent in the conversation thread; prose questions get
  lost.
- They make it explicit when the AI is blocked, vs. when it is
  proceeding.

## When to ask

Ask when **all** of these are true:

1. The decision changes the work materially.
2. You can't infer the answer from context, files, or memory.
3. Proceeding without an answer would risk wasted work.

## When NOT to ask

- Don't ask permission for actions the task already authorised.
- Don't ask the user to choose between options that are functionally
  equivalent — pick one and proceed.
- Don't ask multiple questions at once. Bundle into a single
  multi-option question, or pick the highest-leverage one.

## Format

- Headline: the single question, ending in `?`.
- 2–4 options, mutually exclusive, one recommended.
- "Other" is auto-provided by the UI; don't add it.
