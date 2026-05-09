---
name: pre-mortem
description: Imagine the project shipped and failed; explain why. Use before committing to a plan, design, or launch. Produces a vivid post-mortem dated in the future, working backwards from failure to its root causes.
last_reviewed: 2026-05-09
---

# pre-mortem

Imagine it's six months from now. The thing shipped. It failed. Now
explain — in detail — why.

The trick: working backwards from a concrete failure surfaces risks
that forward-looking risk analysis misses. People are better at
explaining the past than predicting the future, even when both are
made up.

## When to use

- About to commit to a non-trivial plan or launch.
- User says "pre-mortem", "imagine this fails", "what's the worst-case
  story".
- After `weak-spots` — pick the top failure and dramatise it.

## When NOT to use

- The decision is reversible and cheap. Just ship and learn.
- Pure curiosity request — don't waste cycles on theatre.

## Stance

- Treat the failure as having actually happened. Don't hedge with
  "could" or "might". Use past tense.
- Be specific: dates, numbers, named systems, named stakeholders'
  reactions.
- Multiple failure paths beat one. The first explanation is often
  wrong; force a second and a third.

## Procedure

1. Pick the launch / commit moment as `T0`. Pick `T0 + 6 months` as
   "today" for the narrative.
2. Open with the headline failure: what was visible to the user, the
   business, or the on-call engineer?
3. Work backwards: immediate cause → contributing cause → root cause.
4. Repeat for at least one *different* root cause (don't fixate on
   the most likely one).
5. End with the early signal each path would have shown — what to
   instrument now so you'd see it coming.

## Example openers

- "It's [T0 + 6 months]. The launch failed. Here's the post-mortem
  someone would write:"

## Output format

```
# Post-mortem (dated <T0 + 6 months>)

## Headline
<one paragraph: what failed, who noticed, what the impact was>

## Path 1: <name of failure mode>
- Immediate cause: …
- Contributing cause: …
- Root cause: …
- Early signal we'd have seen: …

## Path 2: <different failure mode>
- …

## What to instrument before T0
- …
```
