import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

export type Schedule = RouterOutputs["recurring"]["list"][number];
export type ScheduleInput = RouterInputs["recurring"]["create"];
