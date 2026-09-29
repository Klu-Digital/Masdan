import { HugeiconsIcon } from "@hugeicons/react";
import { ACCOUNT_TYPES } from "@masdan/api/accounts/constants";
import type { AccountType } from "@masdan/api/accounts/constants";
import { IconTile } from "@masdan/ui/components/icon-tile";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { useState } from "react";

import { ACCOUNT_GROUPS, ACCOUNT_KINDS, accountKind } from "../kinds";
import { AccountForm } from "./account-form";
import type { AccountComposerRequest, AccountDefaults } from "./account-form";

export type {
  AccountComposerRequest,
  AccountDefaults,
  AccountDetail,
} from "./account-form";

/** Step one of creating: what kind of account is this? */
const KindPicker = ({ onPick }: { onPick: (type: AccountType) => void }) => (
  <div className="flex flex-col gap-5">
    {ACCOUNT_GROUPS.map((group) => {
      const types = ACCOUNT_TYPES.filter(
        (type) => ACCOUNT_KINDS[type].group === group.key
      );
      return (
        <section className="flex flex-col gap-2" key={group.key}>
          <h3 className="text-muted-foreground text-xs font-medium">
            {group.label}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {types.map((type) => {
              const kind = ACCOUNT_KINDS[type];
              return (
                <button
                  className="bg-card hover:bg-surface-hover focus-visible:ring-ring/50 dark:ring-hairline flex flex-col items-start gap-2 rounded-xl p-3 text-left transition duration-150 outline-none focus-visible:ring-3 active:scale-[0.98] motion-reduce:active:scale-100 dark:ring-1"
                  key={type}
                  onClick={() => onPick(type)}
                  type="button"
                >
                  <IconTile tint={kind.color} size="sm">
                    <HugeiconsIcon icon={kind.icon} strokeWidth={1.8} />
                  </IconTile>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{kind.label}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      {kind.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      );
    })}
  </div>
);

export const AccountComposer = ({
  activeOrganizationId,
  defaults,
  onOpenAccount,
  onOpenChange,
  open,
  request,
}: {
  activeOrganizationId: string;
  defaults: AccountDefaults;
  onOpenAccount?: (accountId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  request: AccountComposerRequest;
}) => {
  const [accountType, setAccountType] = useState<AccountType | null>(
    (request.account?.accountType as AccountType | undefined) ??
      request.accountType ??
      null
  );
  const editing = request.account !== undefined;
  let title = "New account";
  if (editing) {
    title = "Edit account";
  } else if (accountType) {
    title = `New ${accountKind(accountType).noun}`;
  }

  return (
    <ResponsiveSheet
      description={
        accountType
          ? undefined
          : "Choose what you’re adding. You can rename it later."
      }
      onOpenChange={onOpenChange}
      open={open}
      size={accountType ? "default" : "lg"}
      title={title}
    >
      {accountType ? (
        <AccountForm
          account={request.account}
          accountType={accountType}
          activeOrganizationId={activeOrganizationId}
          defaults={defaults}
          onBack={request.accountType ? undefined : () => setAccountType(null)}
          onClose={() => onOpenChange(false)}
          onOpenAccount={onOpenAccount}
        />
      ) : (
        <KindPicker onPick={setAccountType} />
      )}
    </ResponsiveSheet>
  );
};
