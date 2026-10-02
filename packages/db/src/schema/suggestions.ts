/** Category and tags a model proposed, already resolved to household ids. */
export interface CategorizationProposal {
  /** `null` when no listed category fit. */
  categoryId: string | null;
  tagIds: string[];
}

export interface TransactionSuggestionApplication {
  acceptedAt: string;
  acceptedByUserId: string;
  categoryId: string;
  /** Tags the acceptance added, not ones the transaction already had. */
  tagIds: string[];
  suggested: CategorizationProposal;
}

export const transactionImportRowSuggestionStatuses = [
  "pending",
  "accepted",
  "rejected",
  "empty",
] as const;
export type TransactionImportRowSuggestionStatus =
  (typeof transactionImportRowSuggestionStatuses)[number];

/** An import row's suggestion; `empty` means the model had nothing usable. */
export interface TransactionImportRowSuggestion {
  status: TransactionImportRowSuggestionStatus;
  suggested: CategorizationProposal;
  suggestedAt: string;
}
