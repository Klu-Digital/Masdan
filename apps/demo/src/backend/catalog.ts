import {
  INSTITUTION_PRESETS,
  PRODUCT_PRESETS,
} from "@masdan/db/reference/interest-presets";

import type { RouterOutputs } from "@/utils/orpc";

import { seedId } from "./util";

type Catalog = RouterOutputs["interest"]["catalog"];

const INSTITUTION_ID_BASE = 10_000;
const PRODUCT_ID_BASE = 20_000;
const SCHEDULE_ID_BASE = 30_000;

export const institutionId = (key: string): string => {
  const index = INSTITUTION_PRESETS.findIndex((preset) => preset.key === key);
  if (index === -1) {
    throw new Error(`Unknown institution preset ${key}`);
  }
  return seedId(INSTITUTION_ID_BASE + index);
};

export const institutionName = (key: string): string =>
  INSTITUTION_PRESETS.find((preset) => preset.key === key)?.name ?? key;

// The same rows `seedInterestCatalog` writes, built in memory.
export const interestCatalog = (): Catalog => {
  let scheduleIndex = 0;
  return {
    institutions: INSTITUTION_PRESETS.map((preset, index) => ({
      aliases: preset.aliases,
      brandColor: preset.brandColor,
      countryCode: preset.countryCode,
      id: seedId(INSTITUTION_ID_BASE + index),
      institutionType: preset.institutionType,
      key: preset.key,
      logoKey: preset.logoKey,
      name: preset.name,
      shortName: preset.shortName,
      websiteUrl: preset.websiteUrl,
    })),
    products: PRODUCT_PRESETS.map((preset, index) => ({
      aliases: preset.aliases,
      channelInstitutionId: preset.channelInstitutionKey
        ? institutionId(preset.channelInstitutionKey)
        : null,
      currencyCode: preset.currencyCode,
      id: seedId(PRODUCT_ID_BASE + index),
      institutionId: institutionId(preset.institutionKey),
      key: preset.key,
      name: preset.name,
      notes: preset.notes,
      productType: preset.productType,
      schedules: preset.schedules.map((schedule) => {
        scheduleIndex += 1;
        return {
          effectiveFrom: schedule.effectiveFrom,
          effectiveTo: schedule.effectiveTo,
          id: seedId(SCHEDULE_ID_BASE + scheduleIndex),
          sourceCheckedAt: schedule.sourceCheckedAt,
          sourceUrl: schedule.sourceUrl,
          term: schedule.term,
          terms: {
            bonusAnnualRate: schedule.bonusAnnualRate,
            calculationBasis: schedule.calculationBasis,
            conditionSummary: schedule.conditionSummary,
            creditFrequency: schedule.creditFrequency,
            dayCountBasis: schedule.dayCountBasis,
            interestCapBalance: schedule.interestCapBalance,
            minimumBalance: schedule.minimumBalance,
            tierMode: schedule.tierMode,
            tiers: schedule.tiers,
            withholdingTaxRate: schedule.withholdingTaxRate,
          },
        };
      }),
      sourceUrl: preset.sourceUrl,
    })),
  };
};
