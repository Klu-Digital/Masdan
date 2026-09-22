import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@masdan/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { z } from "zod";

import { accountStatementsQueryOptions } from "@/modules/accounts/queries";
import { client } from "@/utils/orpc";

import { formatBalance } from "./account-manager";

type CreditCardAccount = Pick<
  Awaited<ReturnType<typeof client.accounts.get>>,
  | "availableCredit"
  | "balance"
  | "creditLimit"
  | "currencyCode"
  | "id"
  | "utilization"
>;

type Statement = Awaited<
  ReturnType<typeof client.accounts.listStatements>
>[number];

const decimalPattern = /^-?\d+(?<fraction>\.\d{1,6})?$/u;
const nonNegativeDecimalPattern = /^\d+(?<fraction>\.\d{1,6})?$/u;

const statementSchema = z
  .object({
    dueDate: z.string(),
    minimumAmountDue: z
      .string()
      .regex(nonNegativeDecimalPattern, "Use a non-negative amount")
      .or(z.literal("")),
    periodEnd: z.string().min(1, "Period end is required"),
    periodStart: z.string().min(1, "Period start is required"),
    statementBalance: z.string().regex(decimalPattern, "Use a valid amount"),
    statementDate: z.string().min(1, "Statement date is required"),
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "Period must end on or after it starts",
    path: ["periodEnd"],
  });

type StatementFormValues = z.infer<typeof statementSchema>;

const STATEMENT_FIELDS = [
  {
    inputMode: undefined,
    label: "Period start",
    name: "periodStart",
    type: "date",
  },
  {
    inputMode: undefined,
    label: "Period end",
    name: "periodEnd",
    type: "date",
  },
  {
    inputMode: undefined,
    label: "Statement date",
    name: "statementDate",
    type: "date",
  },
  {
    inputMode: undefined,
    label: "Due date",
    name: "dueDate",
    type: "date",
  },
  {
    inputMode: "decimal",
    label: "Statement balance",
    name: "statementBalance",
    type: undefined,
  },
  {
    inputMode: "decimal",
    label: "Minimum amount due",
    name: "minimumAmountDue",
    type: undefined,
  },
] as const;

const today = () => new Date().toISOString().slice(0, 10);

const StatementFormDialog = ({
  accountId,
  onSaved,
}: {
  accountId: string;
  onSaved: () => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: {
      dueDate: "",
      minimumAmountDue: "",
      periodEnd: today(),
      periodStart: today(),
      statementBalance: "",
      statementDate: today(),
    } as StatementFormValues,
    onSubmit: async ({ value, formApi }) => {
      try {
        await client.accounts.createStatement({
          ...value,
          accountId,
          dueDate: value.dueDate || null,
          minimumAmountDue: value.minimumAmountDue || null,
        });
        await onSaved();
        formApi.reset();
        setOpen(false);
        toastManager.add({ title: "Statement recorded", type: "success" });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : "Could not record statement",
          type: "error",
        });
      }
    },
    validators: { onSubmit: statementSchema },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button />}>Record statement</DialogTrigger>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record statement</DialogTitle>
          <DialogDescription>
            Save the issued values so later card changes do not alter history.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          {STATEMENT_FIELDS.map(({ inputMode, label, name, type }) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    id={field.name}
                    inputMode={inputMode}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    type={type}
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message} match>
                      {error?.message}
                    </FieldError>
                  ))}
                </Field>
              )}
            </form.Field>
          ))}
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <div className="flex justify-end sm:col-span-2">
                <Button
                  disabled={!canSubmit}
                  loading={isSubmitting}
                  type="submit"
                >
                  Save statement
                </Button>
              </div>
            )}
          </form.Subscribe>
        </form>
      </DialogPopup>
    </Dialog>
  );
};

export const CreditCardSummary = ({
  account,
  action,
  statements,
}: {
  account: Omit<CreditCardAccount, "id">;
  action?: ReactNode;
  statements: Statement[];
}) => (
  <>
    <Card>
      <CardHeader>
        <CardTitle>Card summary</CardTitle>
        <CardDescription>
          Current balance, available credit, and utilization.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-sm">Outstanding</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">
              {formatBalance(account.balance, account.currencyCode)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Available credit</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">
              {account.availableCredit === null
                ? "Not available"
                : formatBalance(account.availableCredit, account.currencyCode)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Utilization</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">
              {account.utilization === null
                ? "Not available"
                : `${account.utilization}%`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Credit limit</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">
              {account.creditLimit === null
                ? "Not set"
                : formatBalance(account.creditLimit, account.currencyCode)}
            </dd>
          </div>
        </dl>
      </CardPanel>
    </Card>

    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Statement history</CardTitle>
          <CardDescription>
            Issued balances, minimums, periods, and due dates.
          </CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardPanel>
        {statements.length === 0 ? (
          <p className="text-muted-foreground text-sm">No statements yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statement date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Minimum due</TableHead>
                <TableHead>Due date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((statement) => (
                <TableRow key={statement.id}>
                  <TableCell>{statement.statementDate}</TableCell>
                  <TableCell>
                    {statement.periodStart} – {statement.periodEnd}
                  </TableCell>
                  <TableCell>
                    {formatBalance(
                      statement.statementBalance,
                      account.currencyCode
                    )}
                  </TableCell>
                  <TableCell>
                    {statement.minimumAmountDue === null
                      ? "Not set"
                      : formatBalance(
                          statement.minimumAmountDue,
                          account.currencyCode
                        )}
                  </TableCell>
                  <TableCell>{statement.dueDate ?? "Not set"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardPanel>
    </Card>
  </>
);

export const CreditCardSection = ({
  account,
  canUpdate,
}: {
  account: CreditCardAccount;
  canUpdate: boolean;
}) => {
  const queryClient = useQueryClient();
  const statements = useQuery(accountStatementsQueryOptions(account.id));

  if (statements.isPending) {
    return <Skeleton className="h-80 w-full" />;
  }
  if (statements.isError) {
    return (
      <p className="text-muted-foreground">Could not load card statements.</p>
    );
  }

  return (
    <CreditCardSummary
      account={account}
      action={
        canUpdate ? (
          <StatementFormDialog
            accountId={account.id}
            onSaved={() =>
              queryClient.invalidateQueries({
                queryKey: ["account-statements", account.id],
              })
            }
          />
        ) : undefined
      }
      statements={statements.data}
    />
  );
};
