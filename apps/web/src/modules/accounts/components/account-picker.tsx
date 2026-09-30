import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";

import { AccountCardThumb } from "./account-card";
import { AccountTile } from "./account-row";

export interface PickerAccount {
  accountType: string;
  cardLastFour?: string | null;
  cardNetwork?: string | null;
  cardProductKey?: string | null;
  color: string | null;
  currencyCode: string;
  id: string;
  institution?: string | null;
  institutionId?: string | null;
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
      <AccountTile account={account} size="xs" />
    )}
    <span className="truncate">{account.name}</span>
    <span className="text-muted-foreground text-xs">
      {account.currencyCode}
    </span>
  </span>
);

export const AccountPicker = ({
  accounts,
  allowNone = false,
  "aria-invalid": ariaInvalid,
  ariaLabel = "Account",
  onValueChange,
  placeholder = "Choose an account",
  value,
}: {
  accounts: PickerAccount[];
  allowNone?: boolean;
  "aria-invalid"?: boolean;
  ariaLabel?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) => {
  const selected = accounts.find((account) => account.id === value);
  const emptyLabel = allowNone ? "No account" : placeholder;
  return (
    <Select
      onValueChange={(next) =>
        onValueChange(typeof next === "string" && next !== "none" ? next : "")
      }
      value={value || (allowNone ? "none" : null)}
    >
      <SelectTrigger
        aria-invalid={ariaInvalid || undefined}
        aria-label={ariaLabel}
      >
        <SelectValue>
          {selected ? <AccountOption account={selected} /> : emptyLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {allowNone ? <SelectItem value="none">No account</SelectItem> : null}
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            <AccountOption account={account} />
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
};
