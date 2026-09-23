import {
  ArrowDataTransferHorizontalIcon,
  MoneyReceive01Icon,
  MoneySend01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Kbd } from "@masdan/ui/components/kbd";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import type { ReactElement } from "react";

import { useAppActions } from "@/components/app-actions";
import { useHousehold } from "@/hooks/use-household";

/** The one "create" entry point in the chrome; the trigger is supplied. */
export const NewMenu = ({
  side = "bottom",
  trigger,
}: {
  side?: "bottom" | "top" | "right";
  trigger: ReactElement;
}) => {
  const { compose, composeAccount } = useAppActions();
  const { can } = useHousehold();
  const canTransact = can({ transaction: ["create"] });
  const canAccount = can({ financialAccount: ["create"] });

  if (!(canTransact || canAccount)) {
    return null;
  }

  return (
    <Menu>
      <MenuTrigger render={trigger} />
      <MenuPopup align="start" className="min-w-56" side={side}>
        {canTransact ? (
          <>
            <MenuItem
              onClick={() => compose({ kind: "expense", type: "transaction" })}
            >
              <HugeiconsIcon icon={MoneySend01Icon} strokeWidth={1.8} />
              <span className="flex-1">Expense</span>
              <Kbd>N</Kbd>
            </MenuItem>
            <MenuItem
              onClick={() => compose({ kind: "income", type: "transaction" })}
            >
              <HugeiconsIcon icon={MoneyReceive01Icon} strokeWidth={1.8} />
              Income
            </MenuItem>
            <MenuItem onClick={() => compose({ type: "transfer" })}>
              <HugeiconsIcon
                icon={ArrowDataTransferHorizontalIcon}
                strokeWidth={1.8}
              />
              Transfer
            </MenuItem>
          </>
        ) : null}
        {canTransact && canAccount ? <MenuSeparator /> : null}
        {canAccount ? (
          <MenuItem onClick={() => composeAccount()}>
            <HugeiconsIcon icon={Wallet01Icon} strokeWidth={1.8} />
            Account
          </MenuItem>
        ) : null}
      </MenuPopup>
    </Menu>
  );
};
