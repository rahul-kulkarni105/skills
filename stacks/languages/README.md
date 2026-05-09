---
name: stacks-languages
description: Language stack — TypeScript, JavaScript, YAML.
last_reviewed: 2026-05-09
---

# Languages

Language-level conventions that aren't framework- or runtime-specific.

## Files that will live here

- `typescript.md` — `tsconfig` baseline, `any` discipline, type-level
  patterns, generics restraint.
- `javascript.md` — modern syntax baseline, when JS is acceptable
  (rare).
- `yaml.md` — anchors, multi-line strings, the gotchas
  (`yes`/`no`/`on`/`off` parse as booleans in YAML 1.1).

## Cross-cutting rules

### TypeScript (default)

- **`strict: true`**. Always.
- **No `any`** without a comment explaining why. Prefer `unknown`
  + narrowing.
- **Exported APIs carry explicit types.** Inference is fine inside a
  function body.
- **Don't fight inference.** If the inferred type is correct, don't
  re-state it.
- **Type-level cleverness has a cost.** Conditional types and template
  literal magic are read 10× more than they're written.

### JavaScript

- New code is TypeScript. Plain JS only for tiny build scripts and
  config files where TS would be overkill.

### YAML

- Quote string values that could be parsed as something else
  (`"yes"`, `"3.10"`, `"01"`).
- Prefer flow style (`{ a: 1 }`) only for very short structures.
  Block style is more diff-friendly.
- Anchors (`&`/`*`) are powerful but reduce readability — use
  sparingly, with a comment.

## Tools to reach for first

- TypeScript handbook: <https://www.typescriptlang.org/docs>
- TC39 proposals (status): <https://github.com/tc39/proposals>
- YAML spec: <https://yaml.org/spec>

## Anti-patterns

- Re-exporting just to satisfy a "barrel file" pattern. Barrels
  defeat tree-shaking.
- `as` casts where a type guard would do.
- YAML configs that span >200 lines without a section comment.
