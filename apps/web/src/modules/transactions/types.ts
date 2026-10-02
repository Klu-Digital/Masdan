import type { RouterOutputs } from "@/utils/orpc";

export type Transaction =
  RouterOutputs["transactions"]["list"]["items"][number];
// Only `get` reads the creator; list rows stand in for a detail elsewhere.
export type TransactionDetail = Omit<
  RouterOutputs["transactions"]["get"],
  "createdBy"
>;
export type TransactionCreator =
  RouterOutputs["transactions"]["get"]["createdBy"];
