---
name: stacks-testing
description: Testing stack — Vitest and React Testing Library.
last_reviewed: 2026-05-09
---

# Testing

Unit and component tests. Integration tests live near the system
boundary they exercise.

## Files that will live here

- `vitest.md` — config, watch mode, coverage thresholds, mocking
  discipline.
- `react-testing-library.md` — query priorities, async patterns,
  user-event vs fireEvent.

## Cross-cutting rules

- **Test files live next to the code.** `foo.ts` →
  `foo.test.ts`. No parallel `__tests__/` trees.
- **One assertion per concept.** A test name with "and" wants to be
  two tests.
- **Test behaviour, not implementation.** Don't assert internal state.
  Assert what the user / caller observes.
- **Mocks are last resort.** If a real DB / file / network call is
  cheap and deterministic, use the real thing. Reach for mocks only
  when the real thing is genuinely unavailable or unsafe in tests.
- **Async**: prefer `findBy*` over `waitFor` + `getBy*`. Cleaner
  intent.
- **Coverage** is a smoke detector, not a goal. 100% on a function
  with branchless paths is meaningless; 60% on the critical flow
  matters.

## RTL query priority (RTL recommendation)

Use queries in this order:

1. `getByRole` (with `name`)
2. `getByLabelText`
3. `getByPlaceholderText`
4. `getByText`
5. `getByDisplayValue`
6. `getByAltText`
7. `getByTitle`
8. `getByTestId` (last resort)

If you can only find an element by `data-testid`, that's a hint that
the element is missing accessibility metadata.

## Tools to reach for first

- Vitest: <https://vitest.dev>
- React Testing Library: <https://testing-library.com/react>
- user-event: <https://testing-library.com/user-event>

## Anti-patterns

- `wrapper.instance().setState(...)` style tests — they couple to
  React internals.
- Snapshot tests for anything more complex than a serialised data
  structure. UI snapshots rot.
- Excessive mocking that ends up testing the mocks, not the code.
