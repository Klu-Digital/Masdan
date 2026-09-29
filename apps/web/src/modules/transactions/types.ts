import type { RouterOutputs } from "@/utils/orpc";

export type Transaction =
  RouterOutputs["transactions"]["list"]["items"][number];
export type TransactionDetail = RouterOutputs["transactions"]["get"];
