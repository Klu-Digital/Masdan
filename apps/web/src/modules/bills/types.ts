import type { RouterOutputs } from "@/utils/orpc";

export type BillsMonth = RouterOutputs["bills"]["month"];
export type Bill = BillsMonth["bills"][number];
export type BillCandidate = RouterOutputs["bills"]["candidates"][number];
