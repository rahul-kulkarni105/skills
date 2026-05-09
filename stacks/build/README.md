---
name: stacks-build
description: Build and lint stack — Vite, Rollup, oxlint.
last_reviewed: 2026-05-09
---

# Build

Bundler, dev server, and linter.

## Files that will live here

- `vite.md` — config patterns, plugin order, env vars, dev-server.
- `rollup.md` — for libraries; output formats, externals.
- `oxlint.md` — rule selection, plugin config, perf vs ESLint.

## Cross-cutting rules

- **Vite is default for apps.** Rollup is for publishable libraries.
- **Don't fight the defaults.** Vite's defaults handle almost
  everything. Reach for plugins only when something is genuinely
  missing.
- **One bundler config per package.** Don't conditionally branch
  inside the config — split packages instead.
- **Lint is fast or it's ignored.** Use oxlint for the fast path; pull
  in stricter checks (`tsc --noEmit`, type-aware lint) in CI, not the
  watcher.
- **Source maps**: on in dev, on in prod (uploaded to error tracker,
  not served).

## Tools to reach for first

- Vite: <https://vite.dev>
- Rollup: <https://rollupjs.org>
- oxlint: <https://oxc.rs>

## Anti-patterns

- Hand-rolled `tsconfig.json` paths that duplicate the bundler's
  alias config — pick one source of truth.
- Mixing `import.meta.env` and `process.env` in the same package.
- Dropping into a custom plugin when a config flag would do.
