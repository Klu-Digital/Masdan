# TERSE.md

The comment budget for this repo.

## The budget

**One line.** That is the default, and most comments' whole allowance.

**Two or three** buy a footgun: something that has already cost real time to rediscover, or that a plausible "simplification" would silently break.

**Four or more** is the tier the [invariants](AGENTS.md#invariants-worth-knowing-before-editing) sit at — scarce by design. Adding one is a decision, not a default.

## What earns lines

- A load-bearing ordering — `.use(afterCommit).use(transaction)`.
- A trap with an attractive wrong answer — "do not simplify this into `secondaryStorage`".
- A silent failure: something that goes green, looks signed out, or serves stale data instead of throwing.
- A security boundary, and why the obvious check is not enough.

State the bug the line prevents. That is what survives a refactor.

## What earns none

Delete these on sight, including the ones already in the tree:

- Design and aesthetic rationale — why a color, a spacing, a sidebar variant.
- Product reasoning — why a route is a route and not a tab.
- Framework mechanics — "pure layout, so it renders an `<Outlet />`".
- Test preambles explaining why the test exists. The assertions say it.
- Any sentence that restates the line under it.

## Mechanics

- Wrap at 80 columns. Oxfmt does not reflow comments, so this one is on you.
- JSDoc that fits on one line goes on one line: `/** ... */`.
- A lint directive (`oxlint-disable-*`, `@ts-expect-error`) stays the last line of its block, or it stops applying to its target.
- Comments inside a template literal keep their backticks escaped — `packages/db/src/dev-scripts/post-migrate/template.ts` emits a script body, and a bare backtick there breaks the build.

## The bar

Every comment in a diff you produce fits this budget: the ones you wrote, and the over-long ones you edited past.
