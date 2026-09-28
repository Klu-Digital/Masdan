import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListItemTrailing,
  ListSection,
  ListSectionFooter,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { client } from "@/utils/orpc";

import { chatStatusQueryOptions, invalidateChatStatus } from "../queries";
import type { ChatChannelStatus } from "../queries";

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const listFormat = new Intl.ListFormat(undefined, {
  style: "long",
  type: "disjunction",
});

interface PendingCode {
  code: string;
  expiresAt: Date;
  /** Links when the code was issued; one more means it was used. */
  linkedBefore: number;
}

const ChannelRow = ({
  channel,
  onUnlink,
  unlinking,
}: {
  channel: ChatChannelStatus;
  onUnlink: () => void;
  unlinking: boolean;
}) => (
  <ListItem>
    <ListItemContent>
      <ListItemTitle>{channel.label}</ListItemTitle>
      <ListItemDescription>
        {channel.link
          ? `${channel.link.externalName ?? "Linked"} · since ${dateFormat.format(new Date(channel.link.linkedAt))}`
          : "Not linked"}
      </ListItemDescription>
    </ListItemContent>
    {channel.link ? (
      <ListItemTrailing>
        <Button
          aria-label={`Unlink ${channel.label}`}
          loading={unlinking}
          onClick={onUnlink}
          size="sm"
          variant="destructive-outline"
        >
          Unlink
        </Button>
      </ListItemTrailing>
    ) : null}
  </ListItem>
);

const LinkCode = ({
  code,
  expiresAt,
  labels,
}: {
  code: string;
  expiresAt: Date;
  labels: string[];
}) => (
  <ListItem>
    <ListItemContent>
      <ListItemTitle>
        <span className="font-mono text-lg tracking-widest">{code}</span>
      </ListItemTitle>
      <ListItemDescription>
        Send <span className="font-mono">/link {code}</span> to Masdan on{" "}
        {listFormat.format(labels)}. Works once, until{" "}
        {timeFormat.format(expiresAt)}.
      </ListItemDescription>
    </ListItemContent>
    <ListItemTrailing>
      <Button
        aria-label="Copy link command"
        onClick={async () => {
          await navigator.clipboard.writeText(`/link ${code}`);
          toastManager.add({ title: "Command copied", type: "success" });
        }}
        size="icon-sm"
        variant="ghost"
      >
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
      </Button>
    </ListItemTrailing>
  </ListItem>
);

/**
 * Links the viewer's own chat-app accounts to the active household. Links are
 * personal: other members link their own, and see only theirs. One code works
 * on whichever channel it is sent from.
 */
const ChatApps = ({
  activeOrganizationId,
  canLink,
}: {
  activeOrganizationId: string;
  canLink: boolean;
}) => {
  const queryClient = useQueryClient();
  const [pendingCode, setPendingCode] = useState<PendingCode | null>(null);
  useEffect(() => {
    if (!pendingCode) {
      return;
    }
    // An expired code would only fail in the chat app; take it off the screen.
    const timer = setTimeout(
      () => setPendingCode(null),
      pendingCode.expiresAt.getTime() - Date.now()
    );
    return () => clearTimeout(timer);
  }, [pendingCode]);

  const channels = useQuery(
    chatStatusQueryOptions(activeOrganizationId, pendingCode !== null)
  ).data?.channels;
  const linked = channels?.filter((channel) => channel.link) ?? [];
  const unlinked = channels?.filter((channel) => !channel.link) ?? [];
  const showCode = pendingCode && linked.length <= pendingCode.linkedBefore;

  const createCode = useMutation({
    mutationFn: () => client.chat.createLinkCode(),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: (created) =>
      setPendingCode({ ...created, linkedBefore: linked.length }),
  });
  const unlink = useMutation({
    mutationFn: (channel: ChatChannelStatus["channel"]) =>
      client.chat.unlink({ channel }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      setPendingCode(null);
      await invalidateChatStatus(queryClient, activeOrganizationId);
      toastManager.add({ title: "Unlinked", type: "success" });
    },
  });

  if (!channels) {
    return null;
  }
  if (channels.length === 0) {
    return (
      <ListSectionFooter>
        No chat apps are set up on this server yet.
      </ListSectionFooter>
    );
  }

  let linking: React.ReactNode = null;
  if (showCode) {
    linking = (
      <LinkCode
        code={pendingCode.code}
        expiresAt={pendingCode.expiresAt}
        labels={unlinked.map((channel) => channel.label)}
      />
    );
  } else if (canLink && unlinked.length > 0) {
    linking = (
      <ListItem>
        <ListItemContent>
          <ListItemTitle>Link an account</ListItemTitle>
          <ListItemDescription>
            Then message “dinner at jollibee 400 metrobank mc” to add it here.
          </ListItemDescription>
        </ListItemContent>
        <ListItemTrailing>
          <Button
            loading={createCode.isPending}
            onClick={() => createCode.mutate()}
            size="sm"
            variant="tinted"
          >
            Get link code
          </Button>
        </ListItemTrailing>
      </ListItem>
    );
  }

  return (
    <>
      <List>
        {channels.map((channel) => (
          <ChannelRow
            channel={channel}
            key={channel.channel}
            onUnlink={() => unlink.mutate(channel.channel)}
            unlinking={unlink.isPending && unlink.variables === channel.channel}
          />
        ))}
        {linking}
      </List>
      <ListSectionFooter>
        {canLink || linked.length > 0
          ? "Your links are yours alone, and always add to this household — not the one you have open."
          : "Linking needs permission to add transactions in this household."}
      </ListSectionFooter>
    </>
  );
};

export const ChatAppsSection = (props: {
  activeOrganizationId: string;
  canLink: boolean;
}) => {
  // Cosmetic: the procedures answer NOT_FOUND while the flag is off.
  const enabled = useFeatureFlag("FF__CHAT_ENTRY");
  if (!enabled) {
    return null;
  }

  return (
    <ListSection aria-label="Chat apps">
      <ListSectionHeader>Chat apps</ListSectionHeader>
      <ChatApps {...props} />
    </ListSection>
  );
};
