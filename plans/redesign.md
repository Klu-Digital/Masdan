# Masdan UI/UX redesign

A ground-up replacement of the web presentation layer. The API, auth, and data behaviour stay; every screen, the shell, and the design system are rebuilt.

## 1. Inventory — what the product does today

### Routes

| Route | Today | Behaviour that must survive |
| --- | --- | --- |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | Card-in-center auth forms | `?redirect=` round trip, verification resend, reset token |
| `/accept-invite?invitation=` | Card with accept/decline | Wrong-account escape hatch, activates household on accept |
| `/dashboard` | Template placeholder (household name + "private data" ping) | Nothing product-specific — free to design |
| `/accounts` | One card, two tables (assets / liabilities), archive toggle | Create/edit/archive/restore with RBAC; owners; net-worth flag; liquidity; card metadata |
| `/accounts/$accountId` | Balance card, card summary, statements table, card details, card activity, snapshots table | Pay card (transfer into card), record statement, edit, archive/restore, balance snapshots (read) |
| `/transactions` | Filter bar + data grid + pagination, URL-backed search | Search, date range, type, paid status, account, category, tags, sort date/amount, page size, show archived, edit/archive/restore, transfer edit/delete |
| `/transactions/$transactionId` | Detail card | Transfer vs income/expense display, splits, tags, notes, edit, archive/restore, delete transfer |
| `/categories` | Table + dialog (emoji picker, colour, type) | CRUD + archive/restore |
| `/tags` | Table + dialog (colour) | CRUD + archive/restore |
| `/invitations` | Inbox table | Accept (switches household) / decline, expired state |
| `/settings` | Profile name + email verification | Update name, resend verification |
| `/settings/household` | Finance settings, members, pending invites, invite form, create household | Currency + timezone (RBAC), copy invite link, cancel invite, create + switch household |
| `/admin/*` | Platform back office (users, orgs, sessions, files, jobs, flags, roles, system) | Everything — only restyled through the shared system and shell |

### Shell

shadcn-style collapsible sidebar (household switcher, flat nav mixing Invitations/Categories/Tags with core areas, admin group, user menu with theme), breadcrumb header. No mobile-native navigation.

### Domain facts that shape the design

- Transactions have **no payee field**. Their identity is category + notes + account.
- Income vs expense is the **category's** type. Transfers are two postings sharing a `transferId`; the household ledger shows the source posting only.
- Balances are derived (opening balance + postings). Liability balances are positive amounts owed.
- Credit cards: limit, available credit, utilization (server-computed), statement closing day, payment due day, statement history (issued balance, minimum, due date). "Pay card" is a transfer into the card.
- Multi-currency accounts exist; there is no FX data. Totals are only ever summed within one currency.
- **Not in the product**: budgets, recurring transactions, reports, attachments. They are not designed here — no fake functionality.

### Layers

- **Keep untouched:** `packages/api` routers (plus one new read-only summary procedure, below), `packages/auth`, `lib/*` (session, organization, redirect, household-date), `utils/orpc`, query-option modules, `transactions/search.ts`.
- **UI with business logic mixed in:** form components (zod schemas, split arithmetic, submit + invalidation). Their logic is preserved and re-homed; their presentation is rewritten.
- **Purely presentational:** every `*-manager`, table, card, badge, shell component — replaced.

## 2. Design system

### Principles

Calm, deliberate, dense where it matters. Money is the loudest thing on screen. Separation by whitespace and hairlines, not boxes. Colour is semantic, never decorative. Everything a finger or cursor touches answers on press.

### Typography

System stack (SF Pro on Apple platforms): `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`. Tabular numerals for every amount. Size-specific tracking: negative on large sizes, ~0 on body.

| Token | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `text-display` | 34 / 38 | 600 | -0.028em | The one hero number per screen |
| `text-title-1` | 26 / 32 | 700 | -0.022em | Page titles |
| `text-title-2` | 20 / 26 | 600 | -0.017em | Secondary figures, sheet titles |
| `text-title-3` | 16 / 22 | 600 | -0.01em | Section headings |
| `text-body` | 14 / 20 (15 on touch) | 400 | -0.006em | Default |
| `text-caption` | 12 / 16 | 500 | 0 | Labels, metadata |
| `text-micro` | 11 / 14 | 600 | 0.04em uppercase | Table headers, eyebrow labels |

### Colour

Neutral canvas, ink primary actions, one accent ("iris" blue) for selection, focus, links, and chart emphasis.

- Money: **income/positive** green, **expense** plain foreground (a ledger is not a wall of red), **attention** amber, **overdue/over-limit** red.
- Category colours appear only as small tinted tiles/dots.
- Dark mode is designed, not inverted: warm-neutral charcoal canvas (not black), lifted sidebar material, surfaces separated by luminance steps + hairlines.

### Surfaces & depth

1. `canvas` — page background.
2. `sidebar` — slightly tinted material behind navigation.
3. `surface` — grouped content (inset lists, stat strips). Fill, no border in light; hairline in dark.
4. `raised` — popovers, menus, sheets, dialogs. Shadow + hairline.

Radii: 6 (chips) · 8 (controls) · 12 (tiles, surfaces) · 16 (panels) · 20 (sheets/dialogs).

### Spacing & layout

4px grid. Page gutter 16 → 24 → 32. Content max widths: 1180 (overview/lists), 760 (detail/forms/settings). Breakpoints: `<768` phone (tab bar), `768–1279` tablet (icon rail, expandable), `≥1280` desktop (full sidebar).

### Motion

Critically damped springs by default (CSS `linear()` spring curves), no overshoot unless momentum preceded it. Press feedback on pointer-down. Sheets enter/exit along the same edge. `prefers-reduced-motion` → cross-fades only.

## 3. Information architecture

- **Overview** — net worth, cash flow this month (in / out / left, 6-month bars), spending by category, accounts at a glance, cards & upcoming payments, unpaid items, recent activity.
- **Transactions** — the ledger. Search + filter chips, date-grouped rows, inspector sheet for detail, composer sheet for create/edit.
- **Accounts** — grouped like a bank app (Cash & bank · Investments · Property & other · Credit cards · Loans), totals per group, account detail with balance context and its own ledger. Credit-card detail gets a metric strip, utilization, statement timeline, payments.
- **Categories**, **Tags** — "Organize" group.
- **Settings** — Profile, Household (finance defaults, members, invitations, new household). Invitations inbox reachable from the household switcher and an Overview notice.
- **Admin** — unchanged scope, new shell group.

Mobile: bottom tab bar (Overview · Transactions · Add · Accounts · More). Tablet: icon rail. Desktop: full sidebar.

## 4. New API surface (read-only)

`transactions.summary` — cash flow by month and spending by category over a date range, per currency, excluding transfers and archived rows, splitting split transactions by line. Reuses the ledger's own sign rules. Needed for the Overview; nothing else in the API changes.
