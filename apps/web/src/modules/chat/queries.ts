import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type ChatStatus = Awaited<ReturnType<typeof client.chat.status>>;
export type ChatChannelStatus = ChatStatus["channels"][number];

const chatStatusQueryKey = (activeOrganizationId: string) =>
  ["chat", activeOrganizationId] as const;

/** Polled while a code is showing: the link completes in the chat app, not in this tab. */
const LINK_POLL_MS = 3000;

export const chatStatusQueryOptions = (
  activeOrganizationId: string,
  awaitingLink: boolean
) =>
  queryOptions({
    queryFn: () => client.chat.status(),
    queryKey: chatStatusQueryKey(activeOrganizationId),
    refetchInterval: awaitingLink ? LINK_POLL_MS : false,
  });

export const invalidateChatStatus = (
  queryClient: QueryClient,
  activeOrganizationId: string
) =>
  queryClient.invalidateQueries({
    queryKey: chatStatusQueryKey(activeOrganizationId),
  });
