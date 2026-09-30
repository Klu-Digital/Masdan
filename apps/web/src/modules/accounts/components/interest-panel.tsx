import { scheduleOn } from "@masdan/api/interest/catalog";
import { Badge } from "@masdan/ui/components/badge";
import {
  Section,
  SectionHeader,
  SectionTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";

import { Amount } from "@/components/finance/amount";
import { InstitutionLogo } from "@/components/finance/institution-logo";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@/components/finance/stat";
import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { householdOrpc } from "@/utils/orpc";

import {
  formatEffectiveRate,
  interestCatalogQuery,
  termLabel,
} from "../interest";
import type { AccountDetail as Account } from "./account-composer";
import { InterestTermsView } from "./interest-terms";

const Figure = ({
  currency,
  figure,
}: {
  currency: string;
  figure: { gross: string; net: string; tax: string };
}) => {
  const money = useFormattedMoney();
  return (
    <>
      <StatValue>
        <Amount currency={currency} value={figure.net} />
      </StatValue>
      <span className="text-muted-foreground text-xs tabular-nums">
        {money(figure.gross, currency)} less {money(figure.tax, currency)} tax
      </span>
    </>
  );
};

const PlacementFacts = ({
  currency,
  maturityDate,
  principal,
  startDate,
}: {
  currency: string;
  maturityDate: string | null;
  principal: string;
  startDate: string;
}) => (
  <dl className="border-hairline grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-5 sm:grid-cols-3">
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">Placed</dt>
      <dd className="text-sm font-medium">
        <Amount currency={currency} value={principal} />
      </dd>
    </div>
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">On</dt>
      <dd className="text-sm font-medium">{formatLongDate(startDate)}</dd>
    </div>
    {maturityDate ? (
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground text-xs">Matures</dt>
        <dd className="text-sm font-medium">{formatLongDate(maturityDate)}</dd>
      </div>
    ) : null}
  </dl>
);

/** The account's rate and what it should earn, with how credits are posted. */
// oxlint-disable-next-line complexity
export const InterestPanel = ({
  account,
  organizationId,
  today,
}: {
  account: Account;
  organizationId: string;
  today: string;
}) => {
  const saved = account.interest;
  const money = useFormattedMoney();
  const projection = useQuery(
    householdOrpc(organizationId).interest.projection.queryOptions({
      input: { accountId: account.id },
      meta: { suppressErrorToast: true },
    })
  );
  const catalog = useQuery(interestCatalogQuery());
  if (!saved) {
    return null;
  }
  const product = catalog.data?.products.find(
    ({ id }) => id === saved.productId
  );
  const institutions = new Map(
    (catalog.data?.institutions ?? []).map((row) => [row.id, row])
  );
  const bank = product ? institutions.get(product.institutionId) : undefined;
  const channel = product?.channelInstitutionId
    ? institutions.get(product.channelInstitutionId)
    : undefined;
  const { data } = projection;
  const currency = account.currencyCode;
  const title = saved.product
    ? `${saved.product.institutionName} ${saved.product.name}`
    : "Custom rate";
  const source =
    data?.followsPreset && product
      ? scheduleOn(product.schedules, saved.term, today)
      : null;
  const subtitle =
    [
      saved.term ? termLabel(saved.term) : null,
      data?.followsPreset ? "Preset rate" : null,
      saved.customTerms ? "This account’s own rate" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Booked rate";

  return (
    <Section aria-label="Interest">
      <SectionHeader>
        <SectionTitle>Interest</SectionTitle>
        {data ? (
          <Badge variant={data.autoPost ? "brand" : "outline"}>
            {data.autoPost ? "Posts automatically" : "Recorded by hand"}
          </Badge>
        ) : null}
      </SectionHeader>
      <div className="bg-card dark:ring-hairline flex flex-col gap-6 rounded-2xl p-5 sm:p-6 dark:ring-1">
        <div className="flex items-center gap-3.5">
          <InstitutionLogo
            channel={channel ?? null}
            institution={bank ?? null}
            size="lg"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-semibold">{title}</span>
            <span className="text-muted-foreground truncate text-xs">
              {subtitle}
            </span>
          </div>
          {data?.effectiveRate ? (
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                {formatEffectiveRate(data.effectiveRate)}
              </span>
              <span className="text-muted-foreground text-xs">
                a year on this balance
              </span>
            </div>
          ) : null}
        </div>

        {projection.isPending ? (
          <Skeleton className="h-24 w-full" radius="2xl" />
        ) : null}
        {projection.isError ? (
          <p className="text-muted-foreground text-sm" role="alert">
            Could not estimate interest right now.
          </p>
        ) : null}
        {data?.matured && data.maturityDate ? (
          <Badge className="self-start" size="lg" variant="outline">
            Matured {formatLongDate(data.maturityDate)}
          </Badge>
        ) : null}
        {data && !data.terms && !data.matured ? (
          <p className="text-muted-foreground text-sm">
            No rate is in effect today, so nothing is accruing.
          </p>
        ) : null}

        {data?.terms && !data.matured ? (
          <StatGroup className="bg-secondary/40 dark:ring-0">
            {data.toDate ? (
              <Stat>
                <StatLabel>
                  Since {formatShortDate(data.toDate.since, today)}
                </StatLabel>
                <Figure currency={currency} figure={data.toDate} />
              </Stat>
            ) : null}
            {data.nextCredit ? (
              <Stat>
                <StatLabel>
                  Next credit · {formatShortDate(data.nextCredit.date, today)}
                </StatLabel>
                <Figure currency={currency} figure={data.nextCredit} />
              </Stat>
            ) : null}
            {data.projection ? (
              <Stat>
                <StatLabel>
                  {data.projection.toMaturity
                    ? "Rest of term"
                    : "Next 12 months"}
                </StatLabel>
                <Figure currency={currency} figure={data.projection} />
              </Stat>
            ) : null}
          </StatGroup>
        ) : null}

        {data?.terms ? (
          <InterestTermsView
            balance={data.principal ?? data.balance}
            bonusCounted={data.bonusEligible}
            currency={currency}
            headline={false}
            source={source}
            terms={data.terms}
          />
        ) : null}

        {data?.startDate && data.principal ? (
          <PlacementFacts
            currency={currency}
            maturityDate={data.maturityDate}
            principal={data.principal}
            startDate={data.startDate}
          />
        ) : null}

        {data ? (
          <p className="text-muted-foreground border-hairline border-t pt-4 text-xs">
            {data.autoPost
              ? "Estimated from the ledger balance. Each credit is added as Interest Income on its credit date."
              : "Estimated from the ledger balance. Record the bank’s credit as a transaction when it arrives."}
            {data.lastCredit
              ? ` Last credit ${formatShortDate(data.lastCredit.date, today)}: ${money(data.lastCredit.net, currency)}.`
              : ""}
          </p>
        ) : null}
      </div>
    </Section>
  );
};
