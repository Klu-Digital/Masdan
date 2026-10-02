import {
  ArrowUpRight01Icon,
  InformationCircleIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { InterestTerms } from "@masdan/api/interest/constants";
import { Badge } from "@masdan/ui/components/badge";
import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";
import { cn } from "@masdan/ui/lib/utils";

import { formatLongDate } from "@/lib/dates";

import {
  TIER_MODE_NOTES,
  activeTierIndex,
  formatPercent,
  headlineRate,
  termFacts,
  tierRows,
} from "../interest";

export interface TermsSource {
  effectiveFrom: string | null;
  sourceCheckedAt: string | null;
  sourceUrl: string | null;
}

const RateLadder = ({
  active,
  currency,
  terms,
}: {
  active: number | null;
  currency: string;
  terms: InterestTerms;
}) => {
  const rows = tierRows(terms, currency);
  // Bar length only: the rates themselves are shown as text.
  const max = Math.max(
    ...terms.tiers.map((tier) => Number(tier.annualRate)),
    Number.EPSILON
  );
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Rates by balance" className="flex flex-col">
        {rows.map((row, index) => {
          const isActive = index === active;
          const rate = Number(terms.tiers[index]?.annualRate ?? 0);
          return (
            <li
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_minmax(3rem,6rem)_4.5rem] items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-200",
                isActive ? "bg-brand-soft" : "odd:bg-secondary/40"
              )}
              key={row.label}
            >
              <span
                className={cn(
                  "flex min-w-0 items-center gap-2 truncate text-sm tabular-nums",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {row.label}
                {isActive ? (
                  <Badge className="shrink-0" size="sm" variant="outline">
                    Your balance
                  </Badge>
                ) : null}
              </span>
              <Meter
                aria-label={`${row.label}: ${row.rate}`}
                max={max}
                value={rate}
              >
                <MeterTrack className="h-1.5">
                  <MeterIndicator tone={isActive ? "brand" : "neutral"} />
                </MeterTrack>
              </Meter>
              <span
                className={cn(
                  "text-right text-sm tabular-nums",
                  isActive || rate > 0
                    ? "font-semibold"
                    : "text-muted-foreground"
                )}
              >
                {row.rate}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground px-2.5 text-xs">
        {TIER_MODE_NOTES[terms.tierMode]}
      </p>
    </div>
  );
};

export const InterestTermsView = ({
  balance = null,
  bonusCounted,
  currency,
  headline = true,
  source,
  terms,
}: {
  /** Highlights the tier this balance sits in. */
  balance?: string | null;
  /** Whether the bonus is being counted; omitted in the form's preview. */
  bonusCounted?: boolean;
  currency: string;
  headline?: boolean;
  source?: TermsSource | null;
  terms: InterestTerms;
}) => {
  const tiered = terms.tiers.length > 1;
  const facts = termFacts(terms, currency);
  const bonus = terms.bonusAnnualRate;
  // A condition without a bonus is a caveat about the rate itself.
  const caveat = bonus ? null : terms.conditionSummary;

  return (
    <div className="flex flex-col gap-4">
      {headline ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {headlineRate(terms)}
          </span>
          <span className="text-muted-foreground text-sm">a year</span>
        </div>
      ) : null}

      {tiered ? (
        <RateLadder
          active={activeTierIndex(terms, balance)}
          currency={currency}
          terms={terms}
        />
      ) : null}

      {bonus ? (
        <div className="bg-secondary/60 flex items-start gap-2.5 rounded-xl px-3 py-2.5">
          <HugeiconsIcon
            className="text-brand-text mt-0.5 size-4 shrink-0"
            icon={SparklesIcon}
            strokeWidth={1.8}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              +{formatPercent(bonus)} bonus
              {bonusCounted === undefined ? null : (
                <Badge size="sm" variant={bonusCounted ? "success" : "outline"}>
                  {bonusCounted ? "Counted" : "Not counted"}
                </Badge>
              )}
            </span>
            {terms.conditionSummary ? (
              <span className="text-muted-foreground text-xs">
                {terms.conditionSummary}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <div className="flex min-w-0 flex-col gap-0.5" key={fact.label}>
            <dt className="text-muted-foreground text-xs">{fact.label}</dt>
            <dd className="truncate text-sm font-medium tabular-nums">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {caveat ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <HugeiconsIcon
            className="mt-px size-3.5 shrink-0"
            icon={InformationCircleIcon}
            strokeWidth={1.8}
          />
          {caveat}
        </p>
      ) : null}

      {source?.sourceUrl ? (
        <a
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-xs transition-colors"
          href={source.sourceUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {[
            source.sourceCheckedAt
              ? `Rates as of ${formatLongDate(source.sourceCheckedAt)}`
              : "Bank’s published rates",
            source.effectiveFrom
              ? `effective ${formatLongDate(source.effectiveFrom)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          <HugeiconsIcon
            className="size-3"
            icon={ArrowUpRight01Icon}
            strokeWidth={2}
          />
        </a>
      ) : null}
    </div>
  );
};
