# Masdan

A self-hosted household finance tracker: accounts, an income/expense ledger, budgets, bills and reports, shared by the members of a household.

## Language

### People and access

**Household**: The unit that owns all finance data; every record belongs to exactly one. Stored as better-auth's `organization`. _Avoid_: Organization (in product language), workspace, team, tenant

**Personal household**: The household created for a user at sign-up, of which they are the owner.

**Member**: A user's membership in one household, carrying a household **role**. _Avoid_: Collaborator

**Role**: What a member may do inside one household: `owner`, `admin`, `member` or `viewer`.

**Platform admin**: A user with back-office powers over the whole instance, independent of any household role. _Avoid_: Superuser, admin (unqualified)

**Invitation**: A link that lets its holder join a household with a given role until it expires or is cancelled. Its email is only a label. _Avoid_: Invite code

**Recovery**: Regaining access to an account, done by a platform admin or with shell access to the server. Masdan sends no email. _Avoid_: Forgot-password flow

### Accounts and money

**Account**: A place money is held or owed, in one currency: a bank account, wallet, card, loan or asset such as a property. _Avoid_: Wallet, bank account

**Account class**: Whether an account is an **asset** (what the household has) or a **liability** (what it owes). Every account type belongs to one.

**Opening balance**: An account's balance on its opening date, before any ledger entries. Current balance is derived from it plus the ledger.

**Balance snapshot**: A dated balance recorded for an account, used to show history and reconcile against a statement.

**Currency**: An ISO 4217 code with its minor units. A household has a default currency; each account has its own.

**Interest preset**: A bank product Masdan ships with its rates, such as MariBank Savings or a Tonik time deposit. Shared by every household and never edited by one. _Avoid_: Template

**Rate schedule**: One dated version of a preset's rates: tiers, how interest is calculated and credited, and tax. A rate change adds a schedule; it never edits one.

**Interest projection**: An estimate of an account's interest from its ledger balance and rates, shown on the account.

**Interest credit**: One credit period's estimated net interest, posted as Interest Income on its credit date by a worker, for accounts set to post interest. Posted once; archiving the transaction does not bring it back.

**Net worth**: Assets minus liabilities across accounts marked for inclusion, consolidated into the household currency at exchange rates.

### The ledger

**Ledger**: The household's complete, ordered record of movements: its transactions and transfers. Balances and reports are derived from it, never stored.

**Transaction**: One income or expense on one account, on a household calendar day, with a positive amount and a category. It is a **posting** to that account. _Avoid_: Entry, payment, expense (for both kinds)

**Posting**: A single ledger line against one account. A transaction is one posting; a transfer is two, one per side.

**Transfer**: A movement between two of the household's accounts, recorded as a source posting and a destination posting, possibly in different currencies. It is not income or expense.

**Split**: One of several category-amount parts of a transaction, so a single receipt can span categories.

**Category**: A household-defined classification of income or of expenses. Archived, never deleted.

**Tag**: A household-defined label attached to any number of transactions, independent of category.

**Paid status**: Whether a transaction has actually settled (`paid`) or is still owed (`unpaid`).

**Archive**: Soft-deleting a record so history stays intact. Archived records can be restored. _Avoid_: Delete (for ledger records)

**Household date**: A calendar day in the household's own time zone. Transaction dates are household dates, not instants.

### Credit cards and bills

**Statement**: A credit card's periodic summary: period, balance, minimum due and due date. _Avoid_: Bill (for the card's statement)

**Bill**: Something with a due date the household must pay: an occurrence of a recurring expense or a credit card's due date.

**Recurring schedule**: A template that posts a transaction on a daily, weekly or monthly rhythm, indefinitely or until an optional end date, after which it stops itself.

**Reminder**: A notice before a credit card statement or payment falls due.

### Planning

**Budget**: A planned monthly spend for one expense category. Actuals are read from the ledger.

**Savings goal**: A target amount the household is saving toward.

### Automation

**Quick entry**: Turning one line of free text, such as `dinner at jollibee 400 metrobank mc`, into a prefilled transaction.

**Chat entry**: Quick entry through a linked chat app instead of the web. Telegram is the first channel.

**Ask Masdan**: The household’s conversational finance assistant, covering its financial history and the actions its members are permitted to take. Changes are proposed for review and saved only after confirmation.

**Rule**: A household-defined match that assigns a category and tags to matching transactions.

**Suggestion**: An AI-proposed category and tags for a transaction, applied only when a person accepts it.

**Import**: Bringing transactions in from a CSV file, skipping rows already imported.

**Feature flag**: A switch declared in code and toggled by a platform admin at runtime.
