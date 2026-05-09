---
name: code-quality-bar
description: What "good" code looks like in this repo's projects.
last_reviewed: 2026-05-09
---

# Code quality bar

## Scope discipline

- Do exactly what the task requires. No drive-by refactors, no
  speculative abstractions, no "while I'm here" cleanups.
- Three similar lines beats a premature abstraction. Wait for the
  fourth before extracting.
- No half-finished implementations. If a function is added, it must
  have at least one real caller and a test.

## Error handling

- Validate at system boundaries (user input, network, FS). Trust your
  own internal code.
- Don't catch-and-swallow. Either handle the error meaningfully or let
  it propagate.
- Don't add fallbacks for cases that can't happen. They hide real bugs.

## Comments

- Default: no comment. Names should carry meaning.
- Write a comment only when the **why** is non-obvious: a hidden
  invariant, a workaround for a known bug, a perf trick, or behaviour
  that would surprise a reader.
- Never reference the current task, ticket, or PR in code comments.
  Those rot. Put that context in the PR body.

## Tests

- Add a test for any non-trivial change. A change without a test is a
  guess.
- Prefer integration tests that exercise real boundaries; reach for
  mocks only when the real thing is genuinely unavailable.
- One assertion per concept. If a test name needs "and", split it.

## Dependencies

- Don't add a dependency for something the standard library or current
  stack already does. Justify additions in the PR body.
- Pin versions. Lockfile commits go with the change that needed them.

## Type safety (TS-heavy stack)

- No `any` without a comment justifying it.
- Prefer `unknown` + narrowing over `any`.
- Exported APIs carry explicit types. Inference is fine inside a
  function body.

## Performance

- Don't optimise without a measurement. "It might be slow" is not a
  reason.
- For UI: render path > network > bundle size, in that order of
  attention until measured otherwise.

## Security

- See [secrets-and-safety.md](secrets-and-safety.md). Plus: no string
  concatenation into SQL, shell, or HTML. No `eval`. Validate redirects.
