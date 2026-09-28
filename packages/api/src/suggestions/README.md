# Category suggestions

`suggestions.*` (`suggestions.router.ts`) suggests a category and tags for a saved transaction or for import rows under review. Every procedure is an `orgProcedure` behind `requireFlag("FF__AI_CATEGORIZATION")`. The model is the gateway's `categorize` feature, set with `CATEGORIZE_AI_MODEL`. A suggestion never changes the ledger: the user accepts it (edited or as proposed) or rejects it.

## Rules first

The AI only sees what no deterministic rule decided:

- **Saved transaction** (`forTransaction`): when a runnable rule matches, the answer is `rule` and the model is not called. The inspector's Rules section already offers to apply it.
- **Import row** (`forImport`): only `valid` rows with no `ruleApplication`, still on the import's default category for their direction. Rows whose mapped category column set a category are left alone.

## What the model sees

`suggestions.plan.ts` is pure. The model gets each transaction's text (the note, or the import row's description) and its direction, plus the household's active category and tag _names_. It never sees an amount, account, date or identifier. `minimizeSuggestionText` masks runs of 5+ digits (card, account and reference numbers) and caps the text at 200 characters. Import rows that share a description share one suggestion, so each description is sent once, 40 per call.

The answer is untrusted. `resolveSuggestions` matches each name against that household's active categories of the same direction and its active tags. Anything that doesn't match is dropped, never guessed. A proposal that only restates the current category proposes nothing.

## Review and provenance

|  | Suggested | Accepted | Rejected |
| --- | --- | --- | --- |
| Saved transaction | Returned by `forTransaction`, not stored | `acceptForTransaction` edits through `updateTransaction` and sets `suggestionApplication` | Nothing to store |
| Import row | `transaction_import_row.suggestion`, `status: pending`. The row's `categoryId` doesn't move | `resolveImportRows` / `acceptAllForImport` set the row's category and `suggestionApplication` | `suggestion.status: rejected`, category untouched |

`suggestionApplication` records what the model proposed (`suggested`), what the user kept (`categoryId`, added `tagIds`), and who accepted it and when. Like `ruleApplication`, it survives an edit only while the category and tags it set are still there. Import commit copies an accepted row's application and tags onto the transaction. A row still `pending` at commit imports on its default category with no provenance. Re-mapping an import rebuilds its rows, and their suggestions go with them.

Accepted values go through the same checks as a manual edit: the category must be active, in the household and of the transaction's direction, and tags must be active and in the household.

## Failing safe

- `unavailable`: the gateway or `CATEGORIZE_AI_MODEL` is unset, or the call failed, timed out or came back off-schema. Import rows are left unmarked so they can be retried. Descriptions are never logged.
- Flag off: every `suggestions.*` procedure answers `NOT_FOUND`. Manual edits, rules and import commit work as before, and accepted suggestions still commit, since the user confirmed them.

## Tests

`suggestions.test.ts` covers the planner against mocked model output: names outside the household, the wrong direction, unknown refs, and what is and isn't sent. `suggestions.db.test.ts` runs the real procedures with only the gateway and the bucket mocked. It covers rule precedence, household isolation, the flag, failed calls, and accept/edit/reject through to the committed transactions.
