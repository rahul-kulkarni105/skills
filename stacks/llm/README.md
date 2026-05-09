---
name: stacks-llm
description: Local LLM runtime — Ollama notes.
last_reviewed: 2026-05-09
---

# LLM runtime

Notes for running models locally. Hosted-model rules (Claude,
Copilot, Codex, Gemini) live in [../../instructions/](../../instructions/).

## Files that will live here

- `ollama.md` — model selection, `Modelfile` patterns, API usage,
  perf on Apple Silicon vs CUDA.

## Cross-cutting rules

- **Local models are for offline iteration, not production.** Treat
  them as a debugging tool: cheap, private, fast loop.
- **Match model size to RAM.** A 70B model on 32GB will swap and be
  unusable. Default to 7–13B for laptops; larger only with VRAM to
  back it.
- **Quantisation matters.** Q4_K_M is the usual default — good
  quality/size trade-off. Fall back to Q3 only when memory-bound.
- **Don't fine-tune until prompting is exhausted.** Most "we need a
  custom model" requests are solved by a better system prompt and
  retrieval.
- **API compatibility**: Ollama exposes an OpenAI-compatible endpoint.
  Use it from app code so swapping models / providers is config, not
  refactor.

## Tools to reach for first

- Ollama: <https://ollama.com>
- Library: <https://ollama.com/library>
- llama.cpp (under the hood): <https://github.com/ggerganov/llama.cpp>

## Anti-patterns

- Running a local model in production traffic.
- Choosing a model by name recognition rather than benchmarking on
  the actual task.
- Burying provider-specific calls in app code instead of going
  through the OpenAI-compatible shim.
