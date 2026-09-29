import type { RouterOutputs } from "@/utils/orpc";

export type TransactionImport = RouterOutputs["imports"]["get"];
export type ImportRow = RouterOutputs["imports"]["rows"]["items"][number];
