import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { env } from "@masdan/env/web";
import { Button } from "@masdan/ui/components/button";
import { Input } from "@masdan/ui/components/input";
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
import { useState } from "react";

import { formatDate } from "@/lib/dates";
import { getServerUrl } from "@/lib/server-url";
import { householdOrpc } from "@/utils/orpc";

const feedUrl = (path: string): string =>
  `${getServerUrl(env.VITE_SERVER_URL)}${path}`;

/**
 * The viewer's own read-only calendar subscription. The link is shown once,
 * when made — only its hash is kept — so losing it means replacing it.
 */
export const FeedSection = ({
  activeOrganizationId,
}: {
  activeOrganizationId: string;
}) => {
  const queryClient = useQueryClient();
  const feedApi = householdOrpc(activeOrganizationId).bills.feed;
  const status = useQuery(feedApi.status.queryOptions());
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: feedApi.key() });
  const [fresh, setFresh] = useState<string | null>(null);
  const feed = status.data?.feed ?? null;

  const create = useMutation(
    feedApi.create.mutationOptions({
      onSuccess: async ({ path }) => {
        setFresh(feedUrl(path));
        await refresh();
      },
    })
  );
  const revoke = useMutation(
    feedApi.revoke.mutationOptions({
      onSuccess: async () => {
        setFresh(null);
        await refresh();
        toastManager.add({
          title: "Calendar link turned off",
          type: "success",
        });
      },
    })
  );

  let row: React.ReactNode = null;
  if (fresh) {
    row = (
      <ListItem className="flex-wrap">
        <ListItemContent className="min-w-0">
          <ListItemTitle>Your calendar link</ListItemTitle>
          <ListItemDescription>
            Add it to Google Calendar, Apple Calendar or Outlook as a calendar
            “from URL”. It is shown only now.
          </ListItemDescription>
          <Input
            aria-label="Calendar link"
            className="mt-2"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={fresh}
          />
        </ListItemContent>
        <ListItemTrailing>
          <Button
            aria-label="Copy calendar link"
            onClick={async () => {
              await navigator.clipboard.writeText(fresh);
              toastManager.add({ title: "Link copied", type: "success" });
            }}
            size="icon-sm"
            variant="ghost"
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
          </Button>
        </ListItemTrailing>
      </ListItem>
    );
  } else if (feed) {
    row = (
      <ListItem>
        <ListItemContent>
          <ListItemTitle>Calendar link is on</ListItemTitle>
          <ListItemDescription>
            {`Made ${formatDate(feed.createdAt)} · ${
              feed.lastUsedAt
                ? `last synced ${formatDate(feed.lastUsedAt)}`
                : "not synced yet"
            }`}
          </ListItemDescription>
        </ListItemContent>
        <ListItemTrailing>
          <Button
            loading={create.isPending}
            onClick={() => create.mutate()}
            size="sm"
            variant="secondary"
          >
            Replace link
          </Button>
        </ListItemTrailing>
      </ListItem>
    );
  } else if (status.data) {
    row = (
      <ListItem>
        <ListItemContent>
          <ListItemTitle>Subscribe in your calendar app</ListItemTitle>
          <ListItemDescription>
            Due dates show up next to everything else you have on.
          </ListItemDescription>
        </ListItemContent>
        <ListItemTrailing>
          <Button
            loading={create.isPending}
            onClick={() => create.mutate()}
            size="sm"
            variant="tinted"
          >
            Get calendar link
          </Button>
        </ListItemTrailing>
      </ListItem>
    );
  }

  return (
    <ListSection aria-label="Calendar subscription">
      <ListSectionHeader>Calendar subscription</ListSectionHeader>
      <List>
        {row}
        {feed || fresh ? (
          <ListItem>
            <ListItemContent>
              <ListItemDescription>
                Anyone with the link can see event names and dates — never
                amounts. Replacing or turning it off stops the old link at once.
              </ListItemDescription>
            </ListItemContent>
            <ListItemTrailing>
              <Button
                loading={revoke.isPending}
                onClick={() => revoke.mutate()}
                size="sm"
                variant="destructive-outline"
              >
                Turn off
              </Button>
            </ListItemTrailing>
          </ListItem>
        ) : null}
      </List>
      <ListSectionFooter>
        Your link is yours alone and follows your access: leave the household
        and it stops working.
      </ListSectionFooter>
    </ListSection>
  );
};
