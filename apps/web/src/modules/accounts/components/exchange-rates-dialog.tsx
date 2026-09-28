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
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { currenciesQueryOptions } from "@/modules/currency/queries";
import { consolidatedNetWorthQueryOptions } from "@/modules/reports/queries";
import { client } from "@/utils/orpc";

import { exchangeRatesQueryOptions } from "../queries";

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
  const list = useQuery({
    ...exchangeRatesQueryOptions(organizationId),
    enabled: open,
  });
  const currencies = useQuery({ ...currenciesQueryOptions(), enabled: open });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: exchangeRatesQueryOptions(organizationId).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: consolidatedNetWorthQueryOptions(organizationId).queryKey,
      }),
    ]);
  };
  const set = useMutation({
    mutationFn: () =>
      client.exchangeRates.set({
        fromCurrency,
        rate,
        rateDate,
        toCurrency: defaultCurrency,
      }),
    onError: (error: Error) =>
      toastManager.add({ title: error.message, type: "error" }),
    onSuccess: async () => {
      setRate("");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.exchangeRates.remove({ id }),
    onError: (error: Error) =>
      toastManager.add({ title: error.message, type: "error" }),
    onSuccess: refresh,
  });
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
                onClick={() => remove.mutate(row.id)}
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
              set.mutate();
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
