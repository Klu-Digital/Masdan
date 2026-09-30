import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconTile } from "@masdan/ui/components/icon-tile";

import type { Transaction } from "../types";

export const TransactionTile = ({
  size = "default",
  transaction,
}: {
  size?: "default" | "lg" | "sm";
  transaction: Pick<
    Transaction,
    "categoryColor" | "categoryIcon" | "transfer" | "adjustmentDirection"
  >;
}) =>
  transaction.transfer || transaction.adjustmentDirection ? (
    <IconTile aria-hidden="true" size={size}>
      <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={1.8} />
    </IconTile>
  ) : (
    <IconTile aria-hidden="true" tint={transaction.categoryColor} size={size}>
      {transaction.categoryIcon}
    </IconTile>
  );
