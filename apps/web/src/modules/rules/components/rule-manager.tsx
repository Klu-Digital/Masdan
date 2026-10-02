import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  MagicWand01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@masdan/ui/components/alert-dialog";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import {
  Page,
  PageActions,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Switch } from "@masdan/ui/components/switch";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import { ruleEffects, ruleReasons } from "../presentation";
import type { Rule } from "../types";
import { RuleComposer } from "./rule-composer";
import { RuleTester } from "./rule-tester";

const moved = (rules: Rule[], index: number, offset: -1 | 1): string[] => {
  const ids = rules.map(({ id }) => id);
  const target = index + offset;
  const [id] = ids.splice(index, 1);
  if (id === undefined || target < 0 || target > ids.length) {
    return rules.map((rule) => rule.id);
  }
  ids.splice(target, 0, id);
  return ids;
};

export const RuleManager = ({
  activeOrganizationId,
  canCreate,
  canDelete,
  canUpdate,
}: {
  activeOrganizationId: string;
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
}) => {
  const queryClient = useQueryClient();
  const orpc = householdOrpc(activeOrganizationId);
  const rules = useQuery(orpc.rules.list.queryOptions());
  const accounts = useQuery(
    orpc.accounts.list.queryOptions({ input: { includeArchived: true } })
  );
  const categories = useQuery(
    orpc.categories.list.queryOptions({ input: { includeArchived: true } })
  );
  const tags = useQuery(
    orpc.tags.list.queryOptions({ input: { includeArchived: true } })
  );
  const [composer, setComposer] = useState<{
    key: number;
    open: boolean;
    rule?: Rule;
  } | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const setEnabled = useMutation(
    orpc.rules.setEnabled.mutationOptions({
      onSuccess: async (rule) => {
        await invalidate(queryClient, activeOrganizationId, "rules");
        toastManager.add({
          title: rule.enabled
            ? `${rule.name} enabled`
            : `${rule.name} disabled`,
          type: "success",
        });
      },
    })
  );

  const reorder = useMutation(
    orpc.rules.reorder.mutationOptions({
      onSuccess: (ordered) => {
        queryClient.setQueryData(orpc.rules.list.queryKey(), ordered);
      },
    })
  );

  const remove = useMutation(
    orpc.rules.delete.mutationOptions({
      onSuccess: async () => {
        setDeleting(null);
        await invalidate(queryClient, activeOrganizationId, "rules");
        toastManager.add({ title: "Rule deleted", type: "success" });
      },
    })
  );

  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>Rules</PageTitle>
        <PageDescription>
          Categorize and tag transactions automatically. Rules run top to
          bottom, and only the first enabled rule that matches is applied.
        </PageDescription>
      </PageHeading>
      {canCreate ? (
        <PageActions>
          <Button onClick={() => setComposer({ key: Date.now(), open: true })}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New rule
          </Button>
        </PageActions>
      ) : null}
    </PageHeader>
  );

  if (rules.isPending) {
    return (
      <Page width="narrow">
        {header}
        <Skeleton className="h-64 w-full" radius="2xl" />
      </Page>
    );
  }
  if (rules.isError) {
    return (
      <Page width="narrow">
        {header}
        <Empty>
          <EmptyTitle>Couldn’t load rules</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
        </Empty>
      </Page>
    );
  }

  const accountList = accounts.data ?? [];
  const row = (rule: Rule, index: number) => {
    const reasons = ruleReasons(rule.conditions, accountList);
    const effects = ruleEffects({
      categoryName: rule.category?.name ?? null,
      tagNames: rule.tags.map(({ name }) => name),
    });
    return (
      <ListItem className="items-start" key={rule.id}>
        <ListItemLeading>
          <span className="bg-secondary text-muted-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
            {index + 1}
          </span>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>
            {rule.name}
            {rule.enabled ? null : <Badge variant="outline">Off</Badge>}
            {rule.enabled && rule.problem ? (
              <Badge variant="warning">Paused</Badge>
            ) : null}
          </ListItemTitle>
          <span className="text-muted-foreground text-xs">
            {`When ${reasons.join(" · ")}`}
          </span>
          <span className="text-muted-foreground text-xs">
            {effects.join(" · ")}
          </span>
          {rule.problem ? (
            <span className="text-warning-foreground text-xs">
              {`${rule.problem}, so this rule is skipped.`}
            </span>
          ) : null}
        </ListItemContent>
        <ListItemTrailing>
          <div className="flex items-center gap-1">
            {canUpdate ? (
              <>
                <Button
                  aria-label={`Move ${rule.name} up`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() =>
                    reorder.mutate({ ruleIds: moved(rules.data, index, -1) })
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                </Button>
                <Button
                  aria-label={`Move ${rule.name} down`}
                  disabled={
                    index === rules.data.length - 1 || reorder.isPending
                  }
                  onClick={() =>
                    reorder.mutate({ ruleIds: moved(rules.data, index, 1) })
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                </Button>
                <Switch
                  aria-label={`Enable ${rule.name}`}
                  checked={rule.enabled}
                  disabled={setEnabled.isPending}
                  onCheckedChange={(enabled) =>
                    setEnabled.mutate({ enabled, ruleId: rule.id })
                  }
                />
              </>
            ) : null}
            {canUpdate || canDelete ? (
              <Menu>
                <MenuTrigger
                  aria-label={`${rule.name} actions`}
                  render={<Button size="icon-sm" variant="ghost" />}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </MenuTrigger>
                <MenuPopup align="end" className="min-w-40">
                  {canUpdate ? (
                    <MenuItem
                      onClick={() =>
                        setComposer({ key: Date.now(), open: true, rule })
                      }
                    >
                      <HugeiconsIcon
                        icon={PencilEdit02Icon}
                        strokeWidth={1.8}
                      />
                      Edit
                    </MenuItem>
                  ) : null}
                  {canDelete ? (
                    <MenuItem
                      onClick={() => setDeleting(rule)}
                      variant="destructive"
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                      Delete
                    </MenuItem>
                  ) : null}
                </MenuPopup>
              </Menu>
            ) : null}
          </div>
        </ListItemTrailing>
      </ListItem>
    );
  };

  return (
    <Page width="narrow">
      {header}
      {rules.data.length === 0 ? (
        <Empty size="compact">
          <EmptyMedia>
            <HugeiconsIcon icon={MagicWand01Icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>No rules yet</EmptyTitle>
          <EmptyDescription>
            Teach Masdan that “GRAB” means Transport, and imports sort
            themselves.
          </EmptyDescription>
          {canCreate ? (
            <EmptyContent>
              <Button
                onClick={() => setComposer({ key: Date.now(), open: true })}
                variant="secondary"
              >
                Add a rule
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <List aria-label="Rules">{rules.data.map(row)}</List>
          <p className="text-muted-foreground px-1 text-xs">
            Imports apply rules when rows are checked, before you commit.
            Existing transactions change only when you apply a rule to them.
          </p>
          <RuleTester accounts={accountList} rules={rules.data} />
        </>
      )}
      {composer && categories.data && tags.data && accounts.data ? (
        <RuleComposer
          accounts={accounts.data}
          activeOrganizationId={activeOrganizationId}
          categories={categories.data}
          key={composer.key}
          onOpenChange={(open) =>
            setComposer((current) => (current ? { ...current, open } : current))
          }
          open={composer.open}
          rule={composer.rule}
          tags={tags.data}
        />
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        open={deleting !== null}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete “${deleting?.name ?? ""}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              It stops running on new imports. Transactions it already
              categorized keep their category, tags and the note of which rule
              set them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="secondary" />}>
              Cancel
            </AlertDialogClose>
            <Button
              loading={remove.isPending}
              onClick={() => deleting && remove.mutate({ ruleId: deleting.id })}
              variant="destructive"
            >
              Delete rule
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </Page>
  );
};
