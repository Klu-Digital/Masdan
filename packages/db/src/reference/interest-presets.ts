import type {
  InstitutionType,
  InterestProductType,
  InterestTerm,
  InterestTerms,
  InterestTier,
  TermUnit,
} from "./interest";
import { DEFAULT_WITHHOLDING_TAX_RATE } from "./interest";

// Keys are permanent. Never edit a shipped schedule: add a later one.

export interface InstitutionPreset {
  key: string;
  name: string;
  shortName: string;
  aliases: string[];
  countryCode: string;
  institutionType: InstitutionType;
  logoKey: string;
  brandColor: `#${string}`;
  websiteUrl: string;
}

export interface SchedulePreset extends InterestTerms {
  /** `null`: in effect when checked, start not published. */
  effectiveFrom: string | null;
  effectiveTo: string | null;
  term: InterestTerm | null;
  sourceUrl: string;
  sourceCheckedAt: string;
}

export interface ProductPreset {
  key: string;
  institutionKey: string;
  /** The app it is opened through when that changes the product: GSave. */
  channelInstitutionKey: string | null;
  name: string;
  aliases: string[];
  productType: InterestProductType;
  currencyCode: string;
  sourceUrl: string;
  /** Shown when there is no schedule, or to explain one. */
  notes: string | null;
  schedules: SchedulePreset[];
}

const CHECKED = "2026-09-30";

const flat = (annualRate: string): InterestTier[] => [
  { annualRate, minBalance: "0" },
];

const tiers = (...rows: [string, string][]): InterestTier[] =>
  rows.map(([minBalance, annualRate]) => ({ annualRate, minBalance }));

type ScheduleOptions = Partial<Omit<SchedulePreset, "tiers" | "sourceUrl">> & {
  sourceUrl: string;
  tiers: InterestTier[];
};

const savings = (options: ScheduleOptions): SchedulePreset => ({
  bonusAnnualRate: null,
  calculationBasis: "eod",
  conditionSummary: null,
  creditFrequency: "monthly",
  dayCountBasis: "365",
  effectiveFrom: null,
  effectiveTo: null,
  interestCapBalance: null,
  minimumBalance: null,
  sourceCheckedAt: CHECKED,
  term: null,
  tierMode: "marginal",
  withholdingTaxRate: DEFAULT_WITHHOLDING_TAX_RATE,
  ...options,
});

/** One schedule per tenor; `rates` maps each tenor to its tiers. */
const tenors = (
  unit: TermUnit,
  rates: Record<number, InterestTier[]>,
  options: Omit<ScheduleOptions, "tiers">
): SchedulePreset[] =>
  Object.entries(rates).map(([count, tierRows]) =>
    savings({
      calculationBasis: "principal",
      creditFrequency: "maturity",
      tierMode: "whole_balance",
      ...options,
      term: { count: Number(count), unit },
      tiers: tierRows,
    })
  );

export const INSTITUTION_PRESETS: InstitutionPreset[] = [
  {
    aliases: ["Mari", "Mari Bank", "MariBank Philippines", "Seabank"],
    brandColor: "#f5541f",
    countryCode: "PH",
    institutionType: "digital_bank",
    key: "ph-maribank",
    logoKey: "maribank",
    name: "MariBank",
    shortName: "MariBank",
    websiteUrl: "https://www.maribank.ph",
  },
  {
    aliases: ["Maya", "Maya Bank", "PayMaya"],
    brandColor: "#04b36b",
    countryCode: "PH",
    institutionType: "digital_bank",
    key: "ph-maya",
    logoKey: "maya",
    name: "Maya Bank",
    shortName: "Maya",
    websiteUrl: "https://www.mayabank.ph",
  },
  {
    aliases: ["GoTyme", "Go Tyme", "GoTyme Bank"],
    brandColor: "#00b5ad",
    countryCode: "PH",
    institutionType: "digital_bank",
    key: "ph-gotyme",
    logoKey: "gotyme",
    name: "GoTyme Bank",
    shortName: "GoTyme",
    websiteUrl: "https://www.gotyme.com.ph",
  },
  {
    aliases: ["Tonik", "Tonik Bank", "Tonik Digital Bank"],
    brandColor: "#c21e8c",
    countryCode: "PH",
    institutionType: "digital_bank",
    key: "ph-tonik",
    logoKey: "tonik",
    name: "Tonik Digital Bank",
    shortName: "Tonik",
    websiteUrl: "https://tonikbank.com",
  },
  {
    aliases: ["UNO", "UNO Bank", "UNO Digital Bank"],
    brandColor: "#5b2c83",
    countryCode: "PH",
    institutionType: "digital_bank",
    key: "ph-uno",
    logoKey: "uno",
    name: "UNO Digital Bank",
    shortName: "UNO",
    websiteUrl: "https://www.uno.bank",
  },
  {
    aliases: ["CIMB", "CIMB Bank", "CIMB Bank Philippines"],
    brandColor: "#ec1c24",
    countryCode: "PH",
    institutionType: "bank",
    key: "ph-cimb",
    logoKey: "cimb",
    name: "CIMB Bank Philippines",
    shortName: "CIMB",
    websiteUrl: "https://www.cimbbank.com.ph",
  },
  {
    aliases: ["OwnBank", "Own Bank", "The Rural Bank of Cavite City"],
    brandColor: "#1d4ed8",
    countryCode: "PH",
    institutionType: "rural_bank",
    key: "ph-ownbank",
    logoKey: "ownbank",
    name: "OwnBank",
    shortName: "OwnBank",
    websiteUrl: "https://www.ownbank.com",
  },
  {
    aliases: ["Netbank", "Net Bank", "Community Rural Bank of Romblon"],
    brandColor: "#0b3d91",
    countryCode: "PH",
    institutionType: "rural_bank",
    key: "ph-netbank",
    logoKey: "netbank",
    name: "Netbank",
    shortName: "Netbank",
    websiteUrl: "https://netbank.ph",
  },
  {
    aliases: ["BanKo", "BPI BanKo", "BPI Direct BanKo"],
    brandColor: "#f7a81b",
    countryCode: "PH",
    institutionType: "savings_bank",
    key: "ph-banko",
    logoKey: "banko",
    name: "BPI Direct BanKo",
    shortName: "BanKo",
    websiteUrl: "https://www.banko.com.ph",
  },
  {
    aliases: ["Salmon", "Salmon Bank", "Salmon Philippines"],
    brandColor: "#ff6f61",
    countryCode: "PH",
    institutionType: "rural_bank",
    key: "ph-salmon",
    logoKey: "salmon",
    name: "Salmon Bank",
    shortName: "Salmon",
    websiteUrl: "https://salmon.ph",
  },
  {
    aliases: [
      "RCBC",
      "DiskarTech",
      "Rizal Commercial Banking Corporation",
      "RCBC Savings",
    ],
    brandColor: "#003c7d",
    countryCode: "PH",
    institutionType: "bank",
    key: "ph-rcbc",
    logoKey: "rcbc",
    name: "RCBC",
    shortName: "RCBC",
    websiteUrl: "https://www.rcbc.com",
  },
  {
    aliases: ["OFBank", "OF Bank", "Overseas Filipino Bank"],
    brandColor: "#0055a5",
    countryCode: "PH",
    institutionType: "digital_bank",
    key: "ph-ofbank",
    logoKey: "ofbank",
    name: "Overseas Filipino Bank",
    shortName: "OFBank",
    websiteUrl: "https://www.ofbank.com.ph",
  },
  {
    aliases: ["UnionDigital", "Union Digital", "UnionDigital Bank", "UBEH"],
    brandColor: "#f47b20",
    countryCode: "PH",
    institutionType: "digital_bank",
    key: "ph-uniondigital",
    logoKey: "uniondigital",
    name: "UnionDigital Bank",
    shortName: "UnionDigital",
    websiteUrl: "https://uniondigital.com.ph",
  },
  {
    aliases: ["BDO", "BDO Unibank", "Banco de Oro"],
    brandColor: "#0033a0",
    countryCode: "PH",
    institutionType: "bank",
    key: "ph-bdo",
    logoKey: "bdo",
    name: "BDO Unibank",
    shortName: "BDO",
    websiteUrl: "https://www.bdo.com.ph",
  },
  {
    aliases: ["BPI", "Bank of the Philippine Islands"],
    brandColor: "#c8102e",
    countryCode: "PH",
    institutionType: "bank",
    key: "ph-bpi",
    logoKey: "bpi",
    name: "Bank of the Philippine Islands",
    shortName: "BPI",
    websiteUrl: "https://www.bpi.com.ph",
  },
  {
    aliases: ["Metrobank", "Metro Bank", "Metropolitan Bank and Trust"],
    brandColor: "#0038a8",
    countryCode: "PH",
    institutionType: "bank",
    key: "ph-metrobank",
    logoKey: "metrobank",
    name: "Metrobank",
    shortName: "Metrobank",
    websiteUrl: "https://www.metrobank.com.ph",
  },
  {
    aliases: ["EastWest", "East West", "EastWest Bank"],
    brandColor: "#6b2c91",
    countryCode: "PH",
    institutionType: "bank",
    key: "ph-eastwest",
    logoKey: "eastwest",
    name: "EastWest Bank",
    shortName: "EastWest",
    websiteUrl: "https://www.eastwestbanker.com",
  },
  {
    aliases: ["GCash", "G-Cash", "GSave"],
    brandColor: "#007dfe",
    countryCode: "PH",
    institutionType: "channel",
    key: "ph-gcash",
    logoKey: "gcash",
    name: "GCash",
    shortName: "GCash",
    websiteUrl: "https://www.gcash.com",
  },
  {
    aliases: ["DragonFi", "DragonFi Securities"],
    brandColor: "#e4002b",
    countryCode: "PH",
    institutionType: "channel",
    key: "ph-dragonfi",
    logoKey: "dragonfi",
    name: "DragonFi",
    shortName: "DragonFi",
    websiteUrl: "https://www.dragonfi.ph",
  },
];

const MARIBANK = "https://www.maribank.ph/fees-rates";
const MAYA_GOALS = "https://www.mayabank.ph/savings/personal-goals/";
const MAYA_TD = "https://www.mayabank.ph/time-deposit-plus/";
const MAYA_SAVINGS =
  "https://www.maya.ph/stories/the-basics-of-opening-a-maya-savings-account";
const GOTYME =
  "https://www.gotyme.com.ph/help/goalsave/funding-your-goalsave/how-is-interest-calculated-on-my-goalsave-account";
const TONIK = "https://tonikbank.com/deposit-interest-rates";
const UNO_SAVINGS = "https://www.uno.bank/savings-account/";
const UNO_TD = "https://www.uno.bank/time-deposit/";
const CIMB =
  "https://www.cimbbank.com.ph/en/help-and-support/customer-advisories/2026/important-advisory-on-cimb-deposit-interest-rates.html";
const CIMB_PRIME =
  "https://www.cimbbank.com.ph/en/help-and-support/customer-advisories/2026/important-advisory-on-cimb-prime-accounts.html";
const OWNBANK = "https://www.ownbank.com/help-center/category/6/22/314";
const NETBANK = "https://netbank.ph/netbank-mobile/";
const BANKO = "https://www.banko.com.ph/pang-araw-araw/todo-savings";
const SALMON =
  "https://salmon.ph/news/salmon-bank-deposit-terms-conditions-aug-2026";
const RCBC = "https://www.rcbc.com/inclusive-finance";
const OFBANK = "https://www.ofbank.com.ph/products-services/deposits/yanisaver";
const UNIONDIGITAL =
  "https://www.unionbankph.com/sites/default/files/2026-04/UBP2025ASR.pdf";
const BDO =
  "https://www.bdo.com.ph/personal/accounts/time-deposit/peso-time-deposit";
const BPI =
  "https://www.bpi.com.ph/personal/bank/time-deposit-accounts/peso-auto-renew";
const METROBANK =
  "https://www.metrobank.com.ph/articles/time-deposit-rates-and-fees";
const EASTWEST =
  "https://www.eastwestbanker.com/help-and-support-center/deposit/interest-rates";

const product = (
  preset: Omit<
    ProductPreset,
    "aliases" | "channelInstitutionKey" | "currencyCode" | "notes"
  > &
    Partial<ProductPreset>
): ProductPreset => ({
  aliases: [],
  channelInstitutionKey: null,
  currencyCode: "PHP",
  notes: null,
  ...preset,
});

const cimbBase = (sourceUrl: string, annualRate: string) => [
  savings({ effectiveFrom: "2026-06-01", sourceUrl, tiers: flat(annualRate) }),
];

const EASTWEST_WEEK = {
  effectiveFrom: "2026-09-29",
  effectiveTo: "2026-10-05",
  minimumBalance: "10000",
  sourceUrl: EASTWEST,
};

export const PRODUCT_PRESETS: ProductPreset[] = [
  product({
    institutionKey: "ph-maribank",
    key: "ph-maribank-savings",
    name: "Savings",
    productType: "savings",
    schedules: [
      savings({
        creditFrequency: "daily",
        dayCountBasis: "actual",
        sourceUrl: MARIBANK,
        tiers: tiers(["0", "3.25"], ["1000000", "3.75"]),
      }),
    ],
    sourceUrl: MARIBANK,
  }),
  product({
    institutionKey: "ph-maya",
    key: "ph-maya-savings",
    name: "Savings",
    productType: "savings",
    schedules: [
      savings({
        conditionSummary:
          "Base rate only. Mission boosts of up to 15% p.a. are temporary and not included.",
        creditFrequency: "daily",
        effectiveFrom: "2026-05-01",
        sourceUrl: MAYA_SAVINGS,
        tiers: flat("3.00"),
      }),
    ],
    sourceUrl: MAYA_SAVINGS,
  }),
  product({
    aliases: ["Goals"],
    institutionKey: "ph-maya",
    key: "ph-maya-personal-goals",
    name: "Personal Goals",
    productType: "goal_savings",
    schedules: [
      savings({
        conditionSummary: "Balance above ₱100,000 earns nothing.",
        interestCapBalance: "100000",
        sourceUrl: MAYA_GOALS,
        tiers: tiers(
          ["0", "4.00"],
          ["20000", "4.50"],
          ["40000", "5.00"],
          ["60000", "6.50"],
          ["80000", "8.00"]
        ),
      }),
    ],
    sourceUrl: MAYA_GOALS,
  }),
  product({
    aliases: ["TD Plus", "Time Deposit"],
    institutionKey: "ph-maya",
    key: "ph-maya-time-deposit-plus",
    name: "Time Deposit Plus",
    productType: "time_deposit",
    schedules: tenors(
      "month",
      { 12: flat("5.75"), 3: flat("5.50"), 6: flat("6.00") },
      {
        conditionSummary:
          "For accounts opened from 1 Oct 2026. Maya describes these as a 3.5% p.a. base plus a target-based boost.",
        creditFrequency: "monthly",
        effectiveFrom: "2026-10-01",
        interestCapBalance: "1000000",
        sourceUrl: MAYA_TD,
      }
    ),
    sourceUrl: MAYA_TD,
  }),
  product({
    aliases: ["TD Plus 5.5%", "Time Deposit 5.5%"],
    institutionKey: "ph-maya",
    key: "ph-maya-time-deposit-plus-5-5",
    name: "Time Deposit Plus (5.5% p.a.)",
    notes:
      "For accounts opened from 1 Oct 2026. Use the original Time Deposit Plus preset for existing deposits at the older rates.",
    productType: "time_deposit",
    schedules: tenors(
      "month",
      { 12: flat("5.50"), 3: flat("5.50"), 6: flat("5.50") },
      {
        conditionSummary:
          "Includes the target-based boost above the 3.5% p.a. base rate; reach your target amount and date to qualify.",
        creditFrequency: "monthly",
        effectiveFrom: "2026-10-01",
        interestCapBalance: "1000000",
        sourceCheckedAt: "2026-10-02",
        sourceUrl: MAYA_TD,
      }
    ),
    sourceUrl: MAYA_TD,
  }),
  product({
    institutionKey: "ph-gotyme",
    key: "ph-gotyme-goalsave",
    name: "GoalSave",
    productType: "goal_savings",
    schedules: [savings({ sourceUrl: GOTYME, tiers: flat("3.00") })],
    sourceUrl: GOTYME,
  }),
  product({
    institutionKey: "ph-tonik",
    key: "ph-tonik-solo-stash",
    name: "Solo Stash",
    productType: "goal_savings",
    schedules: [savings({ sourceUrl: TONIK, tiers: flat("4.00") })],
    sourceUrl: TONIK,
  }),
  product({
    institutionKey: "ph-tonik",
    key: "ph-tonik-group-stash",
    name: "Group Stash",
    productType: "goal_savings",
    schedules: [
      savings({
        bonusAnnualRate: "0.50",
        conditionSummary: "The owner plus at least 2 participants.",
        sourceUrl: TONIK,
        tiers: flat("4.00"),
      }),
    ],
    sourceUrl: TONIK,
  }),
  product({
    institutionKey: "ph-tonik",
    key: "ph-tonik-time-deposit",
    name: "Time Deposit",
    productType: "time_deposit",
    schedules: tenors(
      "month",
      {
        12: flat("3.50"),
        18: flat("3.50"),
        24: flat("3.50"),
        6: flat("4.00"),
        9: flat("3.50"),
      },
      {
        bonusAnnualRate: "1.00",
        conditionSummary:
          "An average daily balance of at least ₱10,000 kept in Tonik Savings every month of the tenor.",
        sourceUrl: TONIK,
      }
    ),
    sourceUrl: TONIK,
  }),
  product({
    aliases: ["UNOready", "Ready"],
    institutionKey: "ph-uno",
    key: "ph-uno-ready",
    name: "UNOready",
    productType: "savings",
    schedules: [
      savings({
        creditFrequency: "daily",
        sourceUrl: UNO_SAVINGS,
        tierMode: "whole_balance",
        tiers: tiers(["0", "3.00"], ["5000", "3.50"], ["5000000", "1.00"]),
      }),
    ],
    sourceUrl: UNO_SAVINGS,
  }),
  product({
    aliases: ["UNOboost", "#UNOboost", "Boost"],
    institutionKey: "ph-uno",
    key: "ph-uno-boost",
    name: "#UNOboost",
    productType: "time_deposit",
    schedules: tenors(
      "month",
      {
        10: flat("4.50"),
        11: flat("4.50"),
        12: flat("5.50"),
        3: flat("4.50"),
        4: flat("4.00"),
        5: flat("4.00"),
        6: flat("5.00"),
        7: flat("5.00"),
        8: flat("4.25"),
        9: flat("4.25"),
      },
      { sourceUrl: UNO_TD }
    ),
    sourceUrl: UNO_TD,
  }),
  product({
    aliases: ["UNOearn", "#UNOearn", "Earn"],
    institutionKey: "ph-uno",
    key: "ph-uno-earn",
    name: "#UNOearn",
    productType: "time_deposit",
    schedules: tenors(
      "month",
      { 12: flat("4.75"), 24: flat("5.00") },
      { creditFrequency: "monthly", sourceUrl: UNO_TD }
    ),
    sourceUrl: UNO_TD,
  }),
  product({
    channelInstitutionKey: "ph-gcash",
    institutionKey: "ph-cimb",
    key: "ph-cimb-gsave",
    name: "GSave",
    productType: "savings",
    schedules: cimbBase(CIMB, "2.30"),
    sourceUrl: CIMB,
  }),
  product({
    institutionKey: "ph-cimb",
    key: "ph-cimb-upsave",
    name: "UpSave",
    productType: "savings",
    schedules: cimbBase(CIMB, "2.30"),
    sourceUrl: CIMB,
  }),
  product({
    institutionKey: "ph-cimb",
    key: "ph-cimb-grow",
    name: "CIMB Grow",
    productType: "savings",
    schedules: cimbBase(CIMB, "2.30"),
    sourceUrl: CIMB,
  }),
  product({
    channelInstitutionKey: "ph-dragonfi",
    institutionKey: "ph-cimb",
    key: "ph-cimb-dragonfi-save",
    name: "DragonFi Save",
    productType: "savings",
    schedules: cimbBase(CIMB, "2.30"),
    sourceUrl: CIMB,
  }),
  product({
    institutionKey: "ph-cimb",
    key: "ph-cimb-prime",
    name: "Prime deposit account",
    productType: "savings",
    schedules: cimbBase(CIMB_PRIME, "2.80"),
    sourceUrl: CIMB_PRIME,
  }),
  product({
    institutionKey: "ph-ownbank",
    key: "ph-ownbank-own-it",
    name: "Own It",
    productType: "savings",
    schedules: [
      savings({
        creditFrequency: "daily",
        sourceUrl: OWNBANK,
        tiers: flat("3.80"),
      }),
    ],
    sourceUrl: OWNBANK,
  }),
  product({
    institutionKey: "ph-ownbank",
    key: "ph-ownbank-own-wish",
    name: "Own Wish",
    notes: "Set the placement's maturity date: the tenor is chosen per wish.",
    productType: "time_deposit",
    schedules: [
      savings({
        calculationBasis: "principal",
        creditFrequency: "maturity",
        sourceUrl: OWNBANK,
        tiers: flat("5.55"),
      }),
    ],
    sourceUrl: OWNBANK,
  }),
  product({
    institutionKey: "ph-ownbank",
    key: "ph-ownbank-time-deposit",
    name: "Time Deposit",
    productType: "time_deposit",
    schedules: tenors(
      "day",
      {
        15: flat("4.00"),
        180: flat("4.80"),
        30: flat("4.15"),
        360: flat("5.20"),
        60: flat("4.35"),
        90: flat("4.50"),
      },
      { sourceUrl: OWNBANK }
    ),
    sourceUrl: OWNBANK,
  }),
  product({
    institutionKey: "ph-netbank",
    key: "ph-netbank-mobile-savings",
    name: "Mobile Savings",
    productType: "savings",
    schedules: [
      savings({
        conditionSummary: "Rate for new accounts.",
        creditFrequency: "daily",
        sourceUrl: NETBANK,
        tiers: flat("3.25"),
      }),
    ],
    sourceUrl: NETBANK,
  }),
  product({
    institutionKey: "ph-netbank",
    key: "ph-netbank-time-deposit",
    name: "Time Deposit",
    productType: "time_deposit",
    schedules: tenors(
      "month",
      { 12: flat("5.00"), 6: flat("4.50") },
      { sourceUrl: NETBANK }
    ),
    sourceUrl: NETBANK,
  }),
  product({
    aliases: ["TODO", "TODO Savings"],
    institutionKey: "ph-banko",
    key: "ph-banko-todo-savings",
    name: "TODO Savings",
    productType: "savings",
    schedules: [
      savings({
        conditionSummary: "Balance below ₱5,000 earns nothing.",
        minimumBalance: "5000",
        sourceUrl: BANKO,
        tiers: tiers(["0", "5.00"], ["1000000", "0.0625"]),
      }),
    ],
    sourceUrl: BANKO,
  }),
  product({
    institutionKey: "ph-salmon",
    key: "ph-salmon-save",
    name: "Salmon Save",
    productType: "savings",
    schedules: [savings({ sourceUrl: SALMON, tiers: flat("4.00") })],
    sourceUrl: SALMON,
  }),
  product({
    institutionKey: "ph-rcbc",
    key: "ph-rcbc-diskartech",
    name: "DiskarTech",
    productType: "savings",
    schedules: [
      savings({
        conditionSummary:
          "RCBC does not publish how often interest is credited; adjust it if yours differs.",
        sourceUrl: RCBC,
        tiers: flat("4.88"),
      }),
    ],
    sourceUrl: RCBC,
  }),
  product({
    institutionKey: "ph-ofbank",
    key: "ph-ofbank-yanisaver",
    name: "YaniSaver",
    productType: "savings",
    schedules: [
      savings({
        calculationBasis: "adb",
        sourceUrl: OFBANK,
        tierMode: "whole_balance",
        tiers: tiers(
          ["0", "0"],
          ["50000", "0.05"],
          ["500000", "1.00"],
          ["1000000", "2.00"],
          ["3000000", "2.50"],
          ["5000000", "3.00"],
          ["7000000", "3.50"],
          ["9000000", "3.75"],
          ["10000000", "4.00"]
        ),
      }),
    ],
    sourceUrl: OFBANK,
  }),
  product({
    aliases: ["UBEH", "UBEH Save", "Save"],
    institutionKey: "ph-uniondigital",
    key: "ph-uniondigital-save",
    name: "UBEH Save",
    notes:
      "UnionBank reports only “up to 4%” p.a., so there is no preset rate. Enter your account's rate.",
    productType: "savings",
    schedules: [],
    sourceUrl: UNIONDIGITAL,
  }),
  product({
    institutionKey: "ph-bdo",
    key: "ph-bdo-peso-time-deposit",
    name: "Peso Time Deposit",
    notes:
      "0.125% to 0.50% p.a. by tenor (30 to 360 days) and placement, minimum ₱1,000. Enter your placement's rate.",
    productType: "time_deposit",
    schedules: [],
    sourceUrl: BDO,
  }),
  product({
    aliases: ["Auto Renew", "Time Deposit"],
    institutionKey: "ph-bpi",
    key: "ph-bpi-peso-auto-renew-time-deposit",
    name: "Peso Auto Renew Time Deposit",
    productType: "time_deposit",
    schedules: tenors(
      "day",
      {
        182: tiers(["0", "0.375"], ["500000", "0.50"], ["5000000", "0.75"]),
        35: tiers(["0", "0.25"], ["500000", "0.375"], ["5000000", "0.50"]),
        365: tiers(["0", "0.50"], ["5000000", "0.75"]),
        63: tiers(["0", "0.25"], ["500000", "0.50"], ["5000000", "0.625"]),
        91: tiers(["0", "0.375"], ["500000", "0.50"], ["5000000", "0.625"]),
      },
      { dayCountBasis: "360", minimumBalance: "50000", sourceUrl: BPI }
    ),
    sourceUrl: BPI,
  }),
  product({
    aliases: ["Online Time Deposit", "Time Deposit"],
    institutionKey: "ph-metrobank",
    key: "ph-metrobank-online-time-deposit",
    name: "Online Time Deposit",
    productType: "time_deposit",
    schedules: tenors(
      "day",
      {
        180: tiers(["0", "4.50"], ["1000000", "4.75"], ["10000000", "5.00"]),
        30: tiers(["0", "4.25"], ["10000000", "4.50"]),
        360: tiers(["0", "4.50"], ["1000000", "4.75"], ["10000000", "5.00"]),
        60: tiers(["0", "4.375"], ["200000", "4.50"], ["10000000", "4.75"]),
        90: tiers(["0", "4.375"], ["200000", "4.50"], ["10000000", "4.75"]),
      },
      {
        conditionSummary:
          "Priced daily by the market. Tenors of 30–59, 60–179 and 180–364 days share a rate.",
        dayCountBasis: "360",
        effectiveFrom: "2026-07-24",
        minimumBalance: "10000",
        sourceUrl: METROBANK,
      }
    ),
    sourceUrl: METROBANK,
  }),
  product({
    aliases: ["Time Deposit"],
    institutionKey: "ph-eastwest",
    key: "ph-eastwest-peso-time-deposit",
    name: "Peso Time Deposit",
    notes: "EastWest reprices weekly. Check the booked rate on your placement.",
    productType: "time_deposit",
    schedules: tenors(
      "day",
      {
        180: tiers(["0", "0.825"], ["100000", "3.52"], ["10000000", "3.70"]),
        270: tiers(["0", "1.125"], ["100000", "3.52"], ["10000000", "3.70"]),
        30: tiers(["0", "0.625"], ["100000", "3.05"], ["10000000", "3.27"]),
        360: tiers(["0", "1.125"], ["100000", "3.57"], ["10000000", "3.75"]),
        60: tiers(["0", "0.675"], ["100000", "3.17"], ["10000000", "3.39"]),
        90: tiers(["0", "0.725"], ["100000", "3.28"], ["10000000", "3.50"]),
      },
      { ...EASTWEST_WEEK, dayCountBasis: "360" }
    ),
    sourceUrl: EASTWEST,
  }),
  product({
    aliases: ["Online TD"],
    institutionKey: "ph-eastwest",
    key: "ph-eastwest-online-time-deposit",
    name: "Online Peso Time Deposit",
    notes: "EastWest reprices weekly. Check the booked rate on your placement.",
    productType: "time_deposit",
    schedules: tenors(
      "day",
      {
        180: tiers(["0", "1.075"], ["100000", "3.77"], ["10000000", "3.95"]),
        270: tiers(["0", "1.375"], ["100000", "3.77"], ["10000000", "3.95"]),
        30: tiers(["0", "0.875"], ["100000", "3.30"], ["10000000", "3.52"]),
        360: tiers(["0", "1.375"], ["100000", "3.82"], ["10000000", "4.00"]),
        60: tiers(["0", "0.925"], ["100000", "3.42"], ["10000000", "3.64"]),
        90: tiers(["0", "1.225"], ["100000", "3.78"], ["10000000", "4.00"]),
      },
      {
        ...EASTWEST_WEEK,
        conditionSummary: "Includes the 0.25% p.a. online bonus.",
        dayCountBasis: "360",
      }
    ),
    sourceUrl: EASTWEST,
  }),
];
