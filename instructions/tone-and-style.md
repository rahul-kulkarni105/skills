---
name: tone-and-style
description: Voice, length, and formatting rules for AI responses in this repo.
last_reviewed: 2026-05-09
---

# Tone & style

- Short, concise, no preamble. State results directly.
- One question per turn (use the IDE-native question UI — see
  [interaction-style.md](interaction-style.md)).
- No emojis unless the user asks.
- Code-first when the task is code; prose-first when the task is
  explanation. Never both at full length.
- File references use Markdown links: `[file.ts:42](path/to/file.ts#L42)`.
- End-of-turn summary: one or two sentences. What changed, what's next.
- Never narrate internal deliberation in user-facing text.
- Don't write multi-paragraph docstrings or comment blocks. One short
  line max. Default to no comment unless the *why* is non-obvious.
