import { Button } from "@masdan/ui/components/button";
import {
  Dialog,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@masdan/ui/components/dialog";
import { Input } from "@masdan/ui/components/input";
import { Label } from "@masdan/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { invalidate } from "@/utils/invalidate";
import { householdOrpc, orpc } from "@/utils/orpc";

export const ExchangeRatesDialog = ({
  organizationId,
  today,
  defaultCurrency,
}: {
  organizationId: string;
  today: string;
  defaultCurrency: string;
}) => {
  const [open, setOpen] = useState(false);
  const [fromCurrency, setFromCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [rateDate, setRateDate] = useState(today);
  const queryClient = useQueryClient();
  const { exchangeRates } = householdOrpc(organizationId);
  const list = useQuery(exchangeRates.list.queryOptions({ enabled: open }));
  const currencies = useQuery(
    orpc.currencies.list.queryOptions({
      enabled: open,
      staleTime: Number.POSITIVE_INFINITY,
    })
  );
  const refresh = () =>
    invalidate(queryClient, organizationId, "exchangeRates");
  const set = useMutation(
    exchangeRates.set.mutationOptions({
      onSuccess: async () => {
        setRate("");
        await refresh();
      },
    })
  );
  const remove = useMutation(
    exchangeRates.remove.mutationOptions({ onSuccess: refresh })
  );
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>
        Exchange rates
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Exchange rates</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          {list.isPending || currencies.isPending ? (
            <p>Loading rates…</p>
          ) : null}
          {list.isError || currencies.isError ? (
            <p role="alert">
              Couldn’t load exchange rates.{" "}
              <Button
                onClick={() => {
                  list.refetch();
                  currencies.refetch();
                }}
                size="sm"
              >
                Try again
              </Button>
            </p>
          ) : null}
          {list.data?.map((row) => (
            <div
              className="flex items-center justify-between gap-2 text-sm"
              key={row.id}
            >
              <span>
                {row.fromCurrency} → {row.toCurrency}: {row.rate} ·{" "}
                {row.rateDate}
              </span>
              <Button
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: row.id })}
                size="sm"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          ))}
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              set.mutate({
                fromCurrency,
                rate,
                rateDate,
                toCurrency: defaultCurrency,
              });
            }}
          >
            <Label htmlFor="fx-from">From currency</Label>
            <Select
              onValueChange={(value) => setFromCurrency(value ?? "")}
              value={fromCurrency}
            >
              <SelectTrigger disabled={!currencies.data} id="fx-from">
                <SelectValue>{fromCurrency || "Choose currency"}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {currencies.data
                  ?.filter((row) => row.code !== defaultCurrency)
                  .map((row) => (
                    <SelectItem key={row.code} value={row.code}>
                      {row.code}
                    </SelectItem>
                  ))}
              </SelectPopup>
            </Select>
            <p className="text-muted-foreground text-sm">
              To currency: {defaultCurrency}
            </p>
            <Label htmlFor="fx-rate">
              Rate (to currency per 1 from currency)
            </Label>
            <Input
              id="fx-rate"
              inputMode="decimal"
              onChange={(event) => setRate(event.target.value)}
              required
              value={rate}
            />
            <Label htmlFor="fx-date">Rate date</Label>
            <Input
              id="fx-date"
              max={today}
              onChange={(event) => setRateDate(event.target.value)}
              required
              type="date"
              value={rateDate}
            />
            <Button
              disabled={
                set.isPending ||
                !fromCurrency ||
                fromCurrency === defaultCurrency
              }
              loading={set.isPending}
              type="submit"
            >
              Save rate
            </Button>
          </form>
        </div>
      </DialogPopup>
    </Dialog>
  );
};
