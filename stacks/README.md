---
name: stacks
description: Domain-grouped stack guidance. Per-tech files added when real content exists, not pre-emptively.
last_reviewed: 2026-05-09
---

# Stacks

Domain-grouped guidance for the technologies in active use. **Domain
READMEs only at scaffold time** — per-tech files (`vite.md`,
`react.md`, etc.) appear when there is real, non-obvious content to
write. Empty stubs rot.

## Domains

- [frontend/](frontend/README.md) — React, React Router, TanStack
  Router/Query, Redux, RTK Query, Tailwind, CSS, HTML.
- [build/](build/README.md) — Vite, Rollup, oxlint.
- [testing/](testing/README.md) — Vitest, React Testing Library.
- [runtime/](runtime/README.md) — Node.js.
- [languages/](languages/README.md) — TypeScript, JavaScript, YAML.
- [infra/](infra/README.md) — AWS, Terraform, Cloudflare, Vercel, PCF
  (legacy).
- [llm/](llm/README.md) — Ollama runtime notes.

## Decision tree

| You're working on… | Read |
|---|---|
| A React component or hook | `frontend/` |
| Routing or data fetching | `frontend/` (TanStack/React Router/RTK Query) |
| Bundler/dev-server tweaks | `build/` |
| Lint config | `build/` (oxlint) |
| Tests | `testing/` |
| Server-side / scripts | `runtime/` |
| Type errors or `tsconfig` | `languages/` |
| Cloud deploy, IaC | `infra/` |
| Local model runtime | `llm/` |

## When to add a per-tech file

Add `<tech>.md` only when **all** are true:

1. You've hit the same friction or made the same decision **3+ times**
   (Rule of 3).
2. The guidance is non-obvious — not already in the official docs.
3. It applies broadly across this user's projects, not one-off.

Until then, capture lessons in a prompt under
[../prompts/](../prompts/README.md) or in project-level notes.

## What domain READMEs contain

- One-paragraph statement of the domain's scope.
- The list of techs that will have files here.
- Cross-cutting rules that apply to **every** tech in the domain
  (e.g., for `testing/`: "Tests live next to the code, not in a
  parallel `__tests__` tree").
- Pointers to the official docs the AI should reach for first.
