import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

export type Goal = RouterOutputs["goals"]["list"][number];
export type GoalInput = RouterInputs["goals"]["create"];
