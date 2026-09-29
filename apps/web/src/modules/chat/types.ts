import type { RouterOutputs } from "@/utils/orpc";

export type ChatStatus = RouterOutputs["chat"]["status"];
export type ChatChannelStatus = ChatStatus["channels"][number];
