import type { RouterOutputs } from "@/utils/orpc";

type RemindersResult = RouterOutputs["reminders"]["list"];
export type Reminder = RemindersResult["items"][number];
