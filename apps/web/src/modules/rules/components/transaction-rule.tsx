import { MagicWand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useHousehold } from "@/hooks/use-household";
import type { TransactionDetail } from "@/modules/transactions/types";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

import { ruleEffects, ruleReasons } from "../presentation";

const Reasons = ({ reasons }: { reasons: string[] }) => (
  <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
    {reasons.map((reason) => (
      <li key={reason}>{reason}</li>
    ))}
  </ul>
);

type Match = NonNullable<RouterOutputs["rules"]["matchTransaction"]["match"]>;

/** The rule that would run now, why, and only what it would change. */
const MatchPreview = ({
  accounts,
  match,
}: {
  accounts: { id: string; name: string }[];
  match: Match;
}) => {
  const effects = ruleEffects({
    categoryName: match.categoryChanges
      ? (match.rule.category?.name ?? null)
      : null,
    tagNames: match.rule.tags
      .filter(({ id }) => match.addedTagIds.includes(id))
      .map(({ name }) => name),
  });
  return (
    <div className="flex flex-col gap-1">
      <p>
        <span className="font-medium">{match.rule.name}</span>{" "}
        <span className="text-muted-foreground">matches</span>
      </p>
      <Reasons reasons={ruleReasons(match.rule.conditions, accounts)} />
      <p className="text-xs">{effects.join(" · ") || "Nothing to change"}</p>
    </div>
  );
};

export const TransactionRule = ({
  canApply,
  transaction,
}: {
  canApply: boolean;
  transaction: Pick<
    TransactionDetail,
    "archivedAt" | "id" | "ruleApplication" | "splits" | "transfer"
  >;
}) => {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useHousehold();
  const orpc = householdOrpc(activeOrganizationId);
  const accounts = useQuery(
    orpc.accounts.list.queryOptions({ input: { includeArchived: true } })
  );
  const eligible =
    transaction.transfer === null &&
    transaction.archivedAt === null &&
    transaction.splits.length === 0;
  const preview = useQuery(
    orpc.rules.matchTransaction.queryOptions({
      enabled: eligible,
      input: { transactionId: transaction.id },
    })
  );

  const apply = useMutation({
    mutationFn: (ruleId: string) =>
      orpc.rules.applyToTransaction.call({
        ruleId,
        transactionId: transaction.id,
      }),
    onSuccess: async (updated) => {
      await invalidate(queryClient, activeOrganizationId, "ledger");
      toastManager.add({
        title: `Applied ${updated.ruleApplication?.ruleName ?? "rule"}`,
        type: "success",
      });
    },
  });

  if (transaction.transfer !== null) {
    return null;
  }

  const accountList = accounts.data ?? [];
  const applied = transaction.ruleApplication;
  const match = preview.data?.match ?? null;
  const pending =
    match !== null &&
    (match.categoryChanges ||
      match.addedTagIds.length > 0 ||
      applied?.ruleId !== match.rule.id);

  if (!applied && !pending) {
    return null;
  }

  return (
    <section aria-label="Rules" className="flex flex-col gap-2">
      <h3 className="text-muted-foreground px-4 text-xs font-medium">Rules</h3>
      <div className="bg-card dark:ring-hairline flex flex-col gap-3 rounded-2xl px-4 py-3 text-sm dark:ring-1">
        {applied ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2">
              <HugeiconsIcon
                className="text-muted-foreground size-4"
                icon={MagicWand01Icon}
                strokeWidth={1.8}
              />
              <span>
                Set by rule{" "}
                <span className="font-medium">{applied.ruleName}</span>
              </span>
            </p>
            <Reasons reasons={ruleReasons(applied.conditions, accountList)} />
          </div>
        ) : null}
        {match && pending ? (
          <div className="flex flex-col gap-2">
            <MatchPreview accounts={accountList} match={match} />
            {canApply ? (
              <Button
                className="self-start"
                loading={apply.isPending}
                onClick={() => apply.mutate(match.rule.id)}
                size="sm"
                variant="secondary"
              >
                Apply rule
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};
