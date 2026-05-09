---
name: stacks-runtime
description: Runtime stack — Node.js (server-side scripts, tooling, services).
last_reviewed: 2026-05-09
---

# Runtime

Server-side JavaScript / TypeScript on Node.

## Files that will live here

- `nodejs.md` — version pinning, ESM/CJS, streams, worker threads,
  process management.

## Cross-cutting rules

- **Pin Node version** in `.nvmrc` and `package.json#engines`. The
  AI should match the pinned version when running scripts.
- **ESM by default** for new packages (`"type": "module"`). CJS only
  when a hard dependency forces it.
- **Use the standard library first.** `node:fs`, `node:path`,
  `node:crypto`, `node:test`, `node:fetch`. Reach for npm only when
  the standard library is genuinely missing the feature.
- **No top-level await in hot paths** — module load order can become
  hard to reason about. OK in scripts and entry points.
- **Streams over buffers** for anything > a few MB.
- **Don't shell out** for things Node can do natively. `exec` adds
  cross-platform pain.
- **Process signals**: trap `SIGINT` / `SIGTERM` for clean shutdown
  in long-running services.

## Tools to reach for first

- Node docs: <https://nodejs.org/api>
- pnpm: <https://pnpm.io> (preferred package manager when discretion
  allows)

## Anti-patterns

- `console.log` for production logs — use a logger with levels.
- Synchronous `fs` calls in request paths.
- Reinventing `AbortController` with custom flags.
- Catching `unhandledRejection` to keep a broken process alive.
