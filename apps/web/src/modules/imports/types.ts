import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

export type TransactionImport = RouterOutputs["imports"]["get"];
export type ImportRowsInput = RouterInputs["imports"]["rows"];
export type ImportRow = RouterOutputs["imports"]["rows"]["items"][number];
