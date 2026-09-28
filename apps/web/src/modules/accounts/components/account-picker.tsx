import { HugeiconsIcon } from "@hugeicons/react";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";

import { accountKind, accountTint } from "../kinds";
import { AccountCardThumb } from "./account-card";

export interface PickerAccount {
  accountType: string;
  cardLastFour?: string | null;
  cardNetwork?: string | null;
  cardProductKey?: string | null;
  color: string | null;
  currencyCode: string;
  id: string;
  institution?: string | null;
  name: string;
}

const AccountOption = ({ account }: { account: PickerAccount }) => (
  <span className="flex min-w-0 items-center gap-2.5">
    {account.accountType === "credit_card" ? (
      <AccountCardThumb
        account={{
          cardLastFour: account.cardLastFour ?? null,
          cardNetwork: account.cardNetwork ?? null,
          cardProductKey: account.cardProductKey ?? null,
          color: account.color,
          currencyCode: account.currencyCode,
          institution: account.institution ?? null,
          name: account.name,
        }}
        size="xs"
      />
    ) : (
      <IconTile tint={accountTint(account)} size="xs">
        <HugeiconsIcon
          icon={accountKind(account.accountType).icon}
          strokeWidth={2}
        />
      </IconTile>
    )}
    <span className="truncate">{account.name}</span>
    <span className="text-muted-foreground text-xs">
      {account.currencyCode}
    </span>
  </span>
);

export const AccountPicker = ({
  accounts,
  "aria-invalid": ariaInvalid,
  ariaLabel = "Account",
  onValueChange,
  placeholder = "Choose an account",
  value,
}: {
  accounts: PickerAccount[];
  "aria-invalid"?: boolean;
  ariaLabel?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) => {
  const selected = accounts.find((account) => account.id === value);
  return (
    <Select
      onValueChange={(next) =>
        onValueChange(typeof next === "string" ? next : "")
      }
      value={value || null}
    >
      <SelectTrigger
        aria-invalid={ariaInvalid || undefined}
        aria-label={ariaLabel}
      >
        <SelectValue>
          {selected ? <AccountOption account={selected} /> : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            <AccountOption account={account} />
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
};
