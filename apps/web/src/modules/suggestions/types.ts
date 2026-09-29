import type { RouterOutputs } from "@/utils/orpc";

export type TransactionSuggestionResult =
  RouterOutputs["suggestions"]["forTransaction"];
export type ImportSuggestionSummary =
  RouterOutputs["suggestions"]["importSummary"];
