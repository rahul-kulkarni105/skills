---
name: using-with-ollama
description: Notes on running local models via Ollama — runtime, not a configuration target.
last_reviewed: 2026-05-09
---

# Using with Ollama

Ollama is a **runtime**, not an agent. There is no `AGENTS.md`-style
entry file because Ollama doesn't read project context — it serves
models over an OpenAI-compatible API.

This page covers how to use local models alongside the hosted-model
agents this repo configures (Claude, Copilot, Codex, Gemini).

## Where local models fit

- **Offline iteration** — debugging prompts, fast loops without
  network cost.
- **Private data** — content that can't leave the machine.
- **Cheap drafts** — first-pass output before refining with a
  hosted model.

Local models are **not** a substitute for hosted models in
production traffic. Treat them as a debugging tool.

## Picking a model

Match model size to RAM. A 70B model on 32GB will swap and be
unusable. Default to 7–13B for laptops; larger only with VRAM.

Quantisation: **Q4_K_M** is the usual default — best
quality/size trade-off. Fall back to Q3 only when memory-bound.

Don't fine-tune until prompting is exhausted. Most "we need a
custom model" cases are solved by a better system prompt + retrieval.

## API compatibility

Ollama exposes an OpenAI-compatible endpoint at
`http://localhost:11434/v1`. Use it from app code so swapping
between providers is config, not refactor.

## Stack guidance

[../stacks/llm/README.md](../stacks/llm/README.md) has the
cross-cutting rules and anti-patterns.

## See also

- Ollama: <https://ollama.com>
- Library: <https://ollama.com/library>
- llama.cpp: <https://github.com/ggerganov/llama.cpp>
- [tool-matrix.md](tool-matrix.md)
