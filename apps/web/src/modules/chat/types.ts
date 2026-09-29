import type { RouterOutputs } from "@/utils/orpc";

type ChatStatus = RouterOutputs["chatIntegrations"]["status"];
export type ChatChannelStatus = ChatStatus["channels"][number];
