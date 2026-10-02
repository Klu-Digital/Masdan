import { AiSearch02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription } from "@masdan/ui/components/alert";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@masdan/ui/components/sheet";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Amount } from "@/components/finance/amount";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@/components/finance/stat";
import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import { formatLongDate } from "@/lib/dates";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { orpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

type AskResult = RouterOutputs["ask"]["question"];
type AskAnswer = Extract<AskResult, { status: "answered" }>["answer"];

/** Matches the API's limit, so an overlong question never costs a round trip. */
const MAX_LENGTH = 300;
const EXAMPLE_QUESTIONS = [
  "How much did we spend on dining last month?",
  "What was our cash flow last month?",
  "What is our net worth?",
];

const amountsText = (
  amounts: AskAnswer["figures"][number]["amounts"],
  money: ReturnType<typeof useFormattedMoney>
) =>
  amounts.length === 0
    ? "—"
    : amounts.map((item) => money(item.amount, item.currencyCode)).join(" · ");

/** The period and filters behind the numbers, so they can be checked by hand. */
const ContextBadges = ({ context }: { context: AskAnswer["context"] }) => {
  const badges = [
    context.period
      ? `${formatLongDate(context.period.dateFrom)} – ${formatLongDate(context.period.dateTo)}`
      : null,
    context.asOf ? `As of ${formatLongDate(context.asOf)}` : null,
    context.kind === "income" ? "Income" : null,
    context.category ? `Category: ${context.category}` : null,
    context.account ? `Account: ${context.account}` : null,
    context.search ? `Matching “${context.search}”` : null,
  ].filter((badge): badge is string => badge !== null);
  return (
    <ul aria-label="Based on" className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <li key={badge}>
          <Badge variant="outline">{badge}</Badge>
        </li>
      ))}
    </ul>
  );
};

const SourceLink = ({ link }: { link: AskAnswer["link"] }) => {
  if (link.to === "/transactions") {
    return (
      <Button
        render={
          <Link
            search={{ ...DEFAULT_TRANSACTION_SEARCH, ...link.search }}
            to="/transactions"
          />
        }
        size="sm"
        variant="secondary"
      >
        Open these transactions
      </Button>
    );
  }
  if (link.to === "/accounts/$accountId") {
    return (
      <Button
        render={
          <Link
            params={{ accountId: link.accountId }}
            to="/accounts/$accountId"
          />
        }
        size="sm"
        variant="secondary"
      >
        Open account
      </Button>
    );
  }
  return (
    <Button render={<Link to={link.to} />} size="sm" variant="secondary">
      {link.to === "/reports" ? "Open reports" : "Open accounts"}
    </Button>
  );
};

const Answer = ({ answer }: { answer: AskAnswer }) => {
  const money = useFormattedMoney();
  return (
    <div className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-3xl p-5 sm:p-6 dark:ring-1">
      <output className="text-base font-medium">{answer.headline}</output>
      <ContextBadges context={answer.context} />
      {answer.figures.length > 0 ? (
        <StatGroup>
          {answer.figures.map((figure) => (
            <Stat key={figure.label}>
              <StatLabel>{figure.label}</StatLabel>
              <StatValue>{amountsText(figure.amounts, money)}</StatValue>
            </Stat>
          ))}
        </StatGroup>
      ) : null}
      {answer.rows.length > 0 ? (
        <List aria-label={answer.rowsLabel ?? "Details"}>
          {answer.rows.map((row) => (
            <ListItem key={row.id}>
              <ListItemContent>
                <ListItemTitle>{row.label}</ListItemTitle>
                {row.detail || row.count !== null ? (
                  <ListItemDescription>
                    {row.detail ??
                      `${row.count} transaction${row.count === 1 ? "" : "s"}`}
                  </ListItemDescription>
                ) : null}
              </ListItemContent>
              <ListItemTrailing>
                <Amount currency={row.currencyCode} value={row.amount} />
              </ListItemTrailing>
            </ListItem>
          ))}
        </List>
      ) : null}
      <div>
        <SourceLink link={answer.link} />
      </div>
    </div>
  );
};

const Reply = ({ result }: { result: AskResult }) => {
  if (result.status === "answered") {
    return <Answer answer={result.answer} />;
  }
  return (
    <Alert variant={result.status === "unavailable" ? "warning" : "info"}>
      <AlertDescription>
        <output className="block">{result.message}</output>
        {result.status === "clarify" && result.options.length > 0 ? (
          <ul aria-label="Options" className="mt-2 flex flex-wrap gap-1.5">
            {result.options.map((option) => (
              <li key={option}>
                <Badge variant="outline">{option}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
};

export const AskMasdan = () => {
  const [question, setQuestion] = useState("");
  const [open, setOpen] = useState(false);
  const ask = useMutation(
    orpc.ask.question.mutationOptions({
      // The answer panel shows the failure.
      meta: { suppressErrorToast: true },
    })
  );
  const text = question.trim();

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={<Button className="h-10 sm:h-9" variant="secondary" />}
      >
        <HugeiconsIcon icon={AiSearch02Icon} strokeWidth={1.8} />
        Ask Masdan
      </SheetTrigger>
      <SheetPopup className="h-full w-full max-w-none md:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>Ask Masdan</SheetTitle>
          <SheetDescription>
            Ask about spending, income, cash flow, net worth or balances.
            Include a period in your question; report filters don’t apply here.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <div className="flex flex-col gap-4">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (text && !ask.isPending) {
                  ask.mutate({ question: text });
                }
              }}
            >
              <Input
                aria-label="Question"
                disabled={ask.isPending}
                maxLength={MAX_LENGTH}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="How much did we spend on dining last month?"
                start={
                  <HugeiconsIcon icon={AiSearch02Icon} strokeWidth={1.8} />
                }
                value={question}
              />
              <Button
                disabled={text === "" || ask.isPending}
                loading={ask.isPending}
                type="submit"
              >
                Ask
              </Button>
            </form>
            {!ask.data && !ask.isError ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-muted-foreground text-sm">Try a question</p>
                {EXAMPLE_QUESTIONS.map((example) => (
                  <Button
                    className="h-auto text-left whitespace-normal"
                    disabled={ask.isPending}
                    key={example}
                    onClick={() => setQuestion(example)}
                    size="sm"
                    variant="outline"
                  >
                    {example}
                  </Button>
                ))}
              </div>
            ) : null}
            {ask.isPending ? (
              <output
                aria-live="polite"
                className="text-muted-foreground text-sm"
              >
                Checking your household’s finances…
              </output>
            ) : null}
            {ask.isError ? (
              <Alert variant="error">
                <AlertDescription>
                  Couldn’t get an answer. Try again in a moment.
                  <Button
                    className="mt-2"
                    disabled={ask.isPending}
                    onClick={() =>
                      ask.mutate({ question: ask.variables?.question ?? text })
                    }
                    size="sm"
                    variant="secondary"
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {ask.data && !ask.isPending ? <Reply result={ask.data} /> : null}
          </div>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
};
