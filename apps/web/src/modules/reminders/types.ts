import type { RouterOutputs } from "@/utils/orpc";

export type RemindersResult = RouterOutputs["reminders"]["list"];
export type Reminder = RemindersResult["items"][number];
