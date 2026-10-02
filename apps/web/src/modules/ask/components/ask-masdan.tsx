import { AiSearch02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";

import { Amount } from "@/components/finance/amount";
import { usePrivacyMode } from "@/components/finance/privacy-mode";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@/components/finance/stat";
import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import { formatLongDate } from "@/lib/dates";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { invalidate } from "@/utils/invalidate";
import { errorMessage, householdOrpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

type AskResult = RouterOutputs["ask"]["question"];
type AskAnswer = Extract<AskResult, { status: "answered" }>["answer"];

/** Matches the API's limit, so an overlong question never costs a round trip. */
const MAX_LENGTH = 2000;
const EXAMPLE_QUESTIONS = [
  "How much did we spend on dining last month?",
  "Which bills are due and how are our budgets doing?",
  "Create a tag named Family trip",
  "Categorize last month’s Grab expenses as Transport and create a rule for future ones",
];
type AskApplied = RouterOutputs["ask"]["confirm"];
interface Source {
  input?: string;
  result: string;
  tool: string;
}
interface ConversationTurn {
  id: string;
  applied?: AskApplied;
  cancelled?: boolean;
  question: string;
  result: AskResult;
}

const prettyJson = (text: string): string => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

const Sources = ({
  sources,
  title = "Verified sources",
}: {
  sources: Source[];
  title?: string;
}) => (
  <details className="text-sm">
    <summary className="cursor-pointer font-medium">{title}</summary>
    <ul className="mt-2 flex flex-col gap-3">
      {sources.map((source) => (
        <li key={`${source.tool}:${source.input ?? ""}`}>
          <p className="font-medium">{source.tool}</p>
          {source.input ? (
            <p className="text-muted-foreground break-words">
              Filters: {source.input}
            </p>
          ) : null}
          <pre className="bg-muted mt-1 max-h-64 overflow-auto rounded-lg p-3 text-xs break-words whitespace-pre-wrap">
            {prettyJson(source.result)}
          </pre>
        </li>
      ))}
    </ul>
  </details>
);

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

const Reply = ({
  result,
  onOption,
}: {
  result: AskResult;
  onOption: (option: string) => void;
}) => {
  if (result.status === "answered") {
    return <Answer answer={result.answer} />;
  }
  if (result.status === "response") {
    return (
      <div className="bg-card flex flex-col gap-3 rounded-2xl p-4">
        <output className="text-sm whitespace-pre-wrap">
          {result.message}
        </output>
        {result.sources.length > 0 ? (
          <Sources sources={result.sources} />
        ) : null}
      </div>
    );
  }
  return (
    <Alert variant={result.status === "unavailable" ? "warning" : "info"}>
      <AlertDescription>
        <output className="block whitespace-pre-wrap">{result.message}</output>
        {result.status === "clarify" && result.options.length > 0 ? (
          <ul aria-label="Options" className="mt-2 flex flex-wrap gap-1.5">
            {result.options.map((option) => (
              <li key={option}>
                <Button
                  onClick={() => onOption(option)}
                  size="sm"
                  variant="outline"
                >
                  {option}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
};

const ChangePreview = ({
  turn,
  busy,
  confirming,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  confirming: boolean;
  error: string | null;
  onCancel: (requestId: string) => Promise<void>;
  onConfirm: (requestId: string) => Promise<void>;
  turn: ConversationTurn;
}) => {
  if (turn.result.status !== "confirmation") {
    return null;
  }
  const proposal = turn.result;
  if (turn.applied) {
    return (
      <div className="bg-card flex flex-col gap-3 rounded-2xl p-4">
        <output>{turn.applied.message}</output>
        <Sources
          sources={turn.applied.outcomes.map((outcome, index) => ({
            ...outcome,
            input: `Step ${index + 1}`,
          }))}
          title="Saved results"
        />
      </div>
    );
  }
  if (turn.cancelled) {
    return (
      <output className="text-muted-foreground text-sm">
        Proposal cancelled. Nothing was changed.
      </output>
    );
  }
  return (
    <section
      aria-label="Proposed changes"
      className="bg-card flex flex-col gap-4 rounded-2xl p-4"
    >
      <output className="text-sm whitespace-pre-wrap">
        {turn.result.message}
      </output>
      <p className="text-muted-foreground text-sm">
        Nothing is saved until you confirm. This preview expires in 15 minutes.
      </p>
      <ol className="flex flex-col gap-3">
        {turn.result.actions.map((action, index) => (
          <li key={action.id}>
            <p className="font-medium">
              {index + 1}. {action.description}
            </p>
            <p className="text-muted-foreground text-xs">{action.tool}</p>
            <pre className="bg-muted mt-1 max-h-64 overflow-auto rounded-lg p-3 text-xs break-words whitespace-pre-wrap">
              {action.details}
            </pre>
          </li>
        ))}
      </ol>
      {turn.result.sources.length > 0 ? (
        <Sources sources={turn.result.sources} />
      ) : null}
      {error ? (
        <Alert variant="error">
          <AlertDescription>
            {error} If the connection failed, retry this confirmation; it won’t
            duplicate changes.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button
          disabled={busy}
          loading={confirming}
          onClick={async () => {
            await onConfirm(proposal.requestId);
          }}
        >
          Confirm changes
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            await onCancel(proposal.requestId);
          }}
          variant="outline"
        >
          Cancel proposal
        </Button>
      </div>
    </section>
  );
};

export interface AskLayout {
  sidebar: ReactNode;
  trigger: ReactNode;
}

export const AskMasdan = ({
  activeOrganizationId,
  children,
}: {
  activeOrganizationId: string;
  children: (layout: AskLayout) => ReactNode;
}) => {
  const sidebarId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [question, setQuestion] = useState("");
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [privacyOn] = usePrivacyMode();
  const queryClient = useQueryClient();
  const api = householdOrpc(activeOrganizationId).ask;
  const ask = useMutation(
    api.question.mutationOptions({
      meta: { suppressErrorToast: true },
      onSuccess: (result, variables) => {
        setTurns((previous) => [
          ...previous,
          { id: crypto.randomUUID(), question: variables.question, result },
        ]);
      },
    })
  );
  const confirm = useMutation(
    api.confirm.mutationOptions({
      meta: { suppressErrorToast: true },
      onSuccess: async (applied) => {
        setTurns((previous) =>
          previous.map((turn) =>
            turn.result.requestId === applied.requestId
              ? { ...turn, applied }
              : turn
          )
        );
        await invalidate(queryClient, activeOrganizationId, "ask");
      },
    })
  );
  const cancel = useMutation(
    api.cancel.mutationOptions({
      meta: { suppressErrorToast: true },
      onSuccess: (cancelled) => {
        setTurns((previous) =>
          previous.map((turn) =>
            turn.result.requestId === cancelled.requestId
              ? { ...turn, cancelled: true }
              : turn
          )
        );
      },
    })
  );
  const busy = ask.isPending || confirm.isPending || cancel.isPending;
  const text = question.trim();
  const previousId = turns.toReversed().find((turn) => turn.result.requestId)
    ?.result.requestId;
  const send = async (value: string) => {
    await ask
      .mutateAsync({ question: value, ...(previousId ? { previousId } : {}) })
      .catch(() => null);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const trigger = (
    <Button
      aria-controls={sidebarId}
      aria-expanded={open}
      aria-label="Ask Masdan"
      className="h-9 sm:h-8"
      onClick={() => setOpen((value) => !value)}
      ref={triggerRef}
      variant="secondary"
    >
      <HugeiconsIcon icon={AiSearch02Icon} strokeWidth={1.8} />
      <span className="hidden sm:inline">Ask Masdan</span>
    </Button>
  );
  const sidebar = open ? (
    <aside
      aria-label="Ask Masdan"
      className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-1/2 w-full shrink-0 flex-col border-t pb-16 md:h-full md:w-80 md:border-s md:border-t-0 md:pb-0 xl:w-96"
      id={sidebarId}
    >
      <header className="border-sidebar-border flex shrink-0 items-start gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Ask Masdan</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Your household’s history and finances. Review and confirm every
            change. Keep browsing while I work.
          </p>
        </div>
        <Button
          aria-label="Close Ask Masdan"
          onClick={close}
          size="icon"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {privacyOn ? (
          <Alert variant="info">
            <AlertDescription>
              Turn privacy mode off to view this conversation and review
              financial changes.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            {turns.length > 0 ? (
              <div aria-label="Conversation" className="flex flex-col gap-5">
                {turns.map((turn) => (
                  <div className="flex flex-col gap-2" key={turn.id}>
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      You: {turn.question}
                    </p>
                    {turn.result.status === "confirmation" ? (
                      <ChangePreview
                        busy={busy}
                        confirming={
                          confirm.isPending &&
                          confirm.variables?.requestId === turn.result.requestId
                        }
                        error={
                          confirm.isError &&
                          confirm.variables?.requestId === turn.result.requestId
                            ? errorMessage(confirm.error)
                            : null
                        }
                        onCancel={async (requestId) => {
                          await cancel
                            .mutateAsync({ requestId })
                            .catch(() => null);
                        }}
                        onConfirm={async (requestId) => {
                          await confirm
                            .mutateAsync({ requestId })
                            .catch(() => null);
                        }}
                        turn={turn}
                      />
                    ) : (
                      <Reply onOption={setQuestion} result={turn.result} />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <form
              className="flex items-center gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (text && !busy) {
                  await send(text);
                }
              }}
            >
              <Input
                aria-label="Question"
                disabled={busy}
                maxLength={MAX_LENGTH}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a question or describe a task…"
                start={
                  <HugeiconsIcon icon={AiSearch02Icon} strokeWidth={1.8} />
                }
                value={question}
              />
              <Button
                disabled={text === "" || busy}
                loading={ask.isPending}
                type="submit"
              >
                Ask
              </Button>
            </form>
            {turns.length === 0 && !ask.isError ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-muted-foreground text-sm">
                  Try a question or task
                </p>
                {EXAMPLE_QUESTIONS.map((example) => (
                  <Button
                    className="h-auto max-w-full py-1.5 text-left whitespace-normal sm:h-auto"
                    disabled={busy}
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
                Checking your household’s finances and preparing a response…
              </output>
            ) : null}
            {ask.isError ? (
              <Alert variant="error">
                <AlertDescription>
                  <p>Couldn’t get an answer. Try again in a moment.</p>
                  <p>{errorMessage(ask.error)}</p>
                  <Button
                    className="mt-2"
                    disabled={busy}
                    onClick={async () => {
                      await ask
                        .mutateAsync(ask.variables ?? { question: text })
                        .catch(() => null);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {cancel.isError ? (
              <Alert variant="error">
                <AlertDescription>
                  Couldn’t cancel the proposal. {errorMessage(cancel.error)}
                </AlertDescription>
              </Alert>
            ) : null}
            {turns.length > 0 ? (
              <Button
                disabled={busy}
                onClick={() => {
                  setTurns([]);
                  setQuestion("");
                  ask.reset();
                  confirm.reset();
                  cancel.reset();
                }}
                size="sm"
                variant="ghost"
              >
                New conversation
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  ) : null;
  return children({ sidebar, trigger });
};
