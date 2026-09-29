import type { RouterOutputs } from "@/utils/orpc";

export type ChatStatus = RouterOutputs["chatIntegrations"]["status"];
export type ChatChannelStatus = ChatStatus["channels"][number];
