import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

export type Rule = RouterOutputs["rules"]["list"][number];
export type RuleInput = RouterInputs["rules"]["create"];
