---
name: stacks-frontend
description: Frontend stack guidance — React and its data/routing/styling ecosystem.
last_reviewed: 2026-05-09
---

# Frontend

React-centric. Covers component patterns, routing, data fetching,
state, and styling.

## Files that will live here

Added when real content exists (Rule of 3). Anticipated:

- `react.md` — component patterns, hooks rules, ref discipline.
- `react-router.md` — route config, loaders/actions, error
  boundaries.
- `tanstack-router.md` — type-safe routes, search-param schemas.
- `tanstack-query.md` — query keys, invalidation, suspense mode.
- `redux.md` — slice shape, selector patterns.
- `rtk-query.md` — endpoints, tags, polling.
- `tailwind.md` — class organisation, `@apply` discipline, theme.
- `css.md` — modules vs vanilla-extract, cascade discipline.
- `html.md` — semantic HTML, accessibility defaults.

## Cross-cutting rules

- **Component files**: one component per file. Co-locate types,
  styles, and tests next to the component. No parallel `__tests__/`
  trees.
- **State**: server state in TanStack Query / RTK Query. Client state
  in Redux only when shared across unrelated trees; otherwise
  `useState` / `useReducer`.
- **Effects**: `useEffect` is the escape hatch. If a value can be
  derived during render, derive it. If it can be computed in an event
  handler, do that.
- **Refs**: don't read DOM in render. Read in effects or event
  handlers.
- **Accessibility**: every interactive element is keyboard-reachable
  and has a name. Run a screen reader on critical flows once before
  shipping.
- **Forms**: prefer uncontrolled where possible. Reach for a form
  library only when the form has cross-field validation or wizard
  state.
- **Strict mode**: dev runs in StrictMode. If something double-fires,
  it's a bug in your effect, not a bug in React.

## Tools to reach for first

- React docs: <https://react.dev>
- TanStack Query: <https://tanstack.com/query>
- TanStack Router: <https://tanstack.com/router>
- React Router: <https://reactrouter.com>
- Redux Toolkit: <https://redux-toolkit.js.org>
- Tailwind: <https://tailwindcss.com>

## Anti-patterns

- Reaching for `useEffect` to sync state that derives from props.
- Custom hooks that wrap a single library hook with no added value.
- Tailwind `@apply` chains that recreate component classes — make a
  component instead.
- Redux for state that two components share. Lift it or use context.
