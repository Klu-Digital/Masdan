import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

export type Schedule = RouterOutputs["recurringSchedules"]["list"][number];
export type ScheduleInput = RouterInputs["recurringSchedules"]["create"];
