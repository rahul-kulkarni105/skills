---
name: pr-conventions
description: Pull request title, body, and review conventions.
last_reviewed: 2026-05-09
---

# PR conventions

## Title

- ≤70 chars. Same shape as a Conventional Commit summary.
- Don't pack detail into the title; that's what the body is for.

## Body

```
## Summary
- 1–3 bullets on what changed and why.

## Test plan
- [ ] Manual checks performed.
- [ ] Automated tests added / updated.
- [ ] Edge cases considered.

## Screenshots / recordings
<only when UI changed>

## Notes for reviewers
<call-outs, trade-offs, follow-ups>
```

## Rules

- One PR per logical change. Refactors and behaviour changes go in
  separate PRs unless coupling is unavoidable.
- Describe **why**, not just **what**. Diffs already show the what.
- Link the issue/ticket. If there's no ticket, say why not.
- If a UI changed, attach a before/after.
- Never force-push to `main`. Avoid force-push on shared branches; if
  unavoidable, announce it.
- Don't merge with failing CI unless the failure is unrelated and
  documented in the PR.
