export const ACCOUNT_CLASSES = ["asset", "liability"] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

export const ASSET_ACCOUNT_TYPES = [
  "cash",
  "bank",
  "e_wallet",
  "investment",
  "property",
  "vehicle",
  "receivable",
  "other_asset",
] as const;

export const LIABILITY_ACCOUNT_TYPES = [
  "credit_card",
  "personal_loan",
  "mortgage",
  "auto_loan",
  "payable",
  "other_liability",
] as const;

export const ACCOUNT_TYPES = [
  ...ASSET_ACCOUNT_TYPES,
  ...LIABILITY_ACCOUNT_TYPES,
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LIQUIDITY_TYPES = ["liquid", "semi_liquid", "illiquid"] as const;
export type Liquidity = (typeof LIQUIDITY_TYPES)[number];

export const SNAPSHOT_SOURCES = ["manual", "import"] as const;
