import { householdToday } from "@masdan/api/reports/periods";
import { fixedAmountText, signedScaledAmount } from "@masdan/api/shared/money";
import { ORPCError } from "@orpc/client";

export const newId = (): string => crypto.randomUUID();

/** Stable v4-shaped ids for seed rows, so reloads keep the same deep links. */
export const seedId = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const money = (value: number): string =>
  fixedAmountText(BigInt(Math.round(value * 100)) * 10_000n);

export {
  fixedAmountText as text,
  signedScaledAmount as scaled,
} from "@masdan/api/shared/money";

export const sum = (values: readonly string[]): bigint => {
  let total = 0n;
  for (const value of values) {
    total += signedScaledAmount(value);
  }
  return total;
};

export const todayIn = (timezone: string): string =>
  householdToday(timezone, new Date());

// Defined, so the app's error toast shows the message instead of a generic one.
export const unavailable = (): ORPCError<"PRECONDITION_FAILED", unknown> =>
  new ORPCError("PRECONDITION_FAILED", {
    defined: true,
    message: "That needs the Masdan server, so it’s off in the demo.",
  });

export const notFound = (entity: string): ORPCError<"NOT_FOUND", unknown> =>
  new ORPCError("NOT_FOUND", { defined: true, message: `${entity} not found` });

export const badRequest = (
  message: string
): ORPCError<"BAD_REQUEST", unknown> =>
  new ORPCError("BAD_REQUEST", { defined: true, message });

export const find = <T extends { id: string }>(
  rows: readonly T[],
  id: string | null | undefined,
  entity: string
): T => {
  const row = rows.find((item) => item.id === id);
  if (!row) {
    throw notFound(entity);
  }
  return row;
};

export const byDateDesc = (a: string, b: string): number => b.localeCompare(a);
