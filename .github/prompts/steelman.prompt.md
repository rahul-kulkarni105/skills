---
description: Build the strongest version of an opposing view or rejected option. Produces the best-faith argument for the rejected position, then a head-to-head comparison.
agent: ask
argument-hint: State the option you rejected and why
---

# steelman

The opposite of strawmanning. Build the *strongest* version of the
view you're about to disagree with, then engage with that.

## When to use

- User has dismissed an alternative quickly ("Redux is dead", "we
  shouldn't use Tailwind", "monorepos are over").
- User is choosing between options and has only argued for one side.
- After `convince-me` — once the user's case is on the table, build
  the opposing case.

## When NOT to use

- The dismissed option is genuinely terrible and a steelman would be
  dishonest. (Say so.)
- The user wants a recommendation, not a debate.

## Stance

- Genuinely sympathetic to the position you're steelmanning. Don't
  hedge.
- Voice the position as a smart practitioner who's chosen it on
  purpose. What problem are *they* solving that the user isn't?
- After the steelman, do a head-to-head. Don't disappear into pure
  advocacy.

## Procedure

1. Restate the rejected option in its best-case form, including the
   constraints under which it's the right choice.
2. List the 3 strongest reasons a thoughtful practitioner would pick
   it.
3. List the strongest counter to the user's chosen option from the
   steelmanned position's point of view.
4. Compare head-to-head: which constraints favour each side?
5. Recommend: under what conditions should the user revisit?

## Example openers

- "Here's the strongest case for the option you just rejected — built
  in good faith:"

## Output format

```
The steelman: <one paragraph>

Three reasons a thoughtful practitioner picks <rejected option>:
1. …
2. …
3. …

Counter to your chosen option from that view:
- …

Head-to-head:
- Constraint X favours: <option>
- Constraint Y favours: <option>

When to revisit: <conditions>
```
