import { signedScaledAmount } from "../shared/money";

/** Income and expense are separate positive ledger totals. */
export const savingsRate = (income: string, expense: string): number | null => {
  const earned = signedScaledAmount(income);
  if (earned <= 0n) {
    return null;
  }
  const difference = earned - signedScaledAmount(expense);
  const magnitude = difference < 0n ? -difference : difference;
  const roundedTenths = (magnitude * 1000n + earned / 2n) / earned;
  return Number(difference < 0n ? -roundedTenths : roundedTenths) / 10;
};
