import {
  BankIcon,
  Car01Icon,
  Car02Icon,
  Cash01Icon,
  ChartIncreaseIcon,
  Coins01Icon,
  CreditCardIcon,
  HandCoinsIcon,
  House01Icon,
  House03Icon,
  Invoice01Icon,
  MoneyReceive01Icon,
  ReceiptDollarIcon,
  SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { AccountType } from "@masdan/api/accounts/constants";

export type AccountGroup =
  | "cash"
  | "investments"
  | "property"
  | "credit"
  | "loans";

export interface AccountKind {
  accountClass: "asset" | "liability";
  color: string;
  description: string;
  group: AccountGroup;
  icon: IconSvgElement;
  label: string;
  /** Singular noun for sentences: "a bank account", "a credit card". */
  noun: string;
}

/** Everything the UI knows about an account type, in one table. */
export const ACCOUNT_KINDS: Record<AccountType, AccountKind> = {
  auto_loan: {
    accountClass: "liability",
    color: "orange",
    description: "Car financing",
    group: "loans",
    icon: Car02Icon,
    label: "Auto loan",
    noun: "auto loan",
  },
  bank: {
    accountClass: "asset",
    color: "blue",
    description: "Checking or savings",
    group: "cash",
    icon: BankIcon,
    label: "Bank",
    noun: "bank account",
  },
  cash: {
    accountClass: "asset",
    color: "green",
    description: "Physical money on hand",
    group: "cash",
    icon: Cash01Icon,
    label: "Cash",
    noun: "cash wallet",
  },
  credit_card: {
    accountClass: "liability",
    color: "indigo",
    description: "Revolving credit with statements",
    group: "credit",
    icon: CreditCardIcon,
    label: "Credit card",
    noun: "credit card",
  },
  e_wallet: {
    accountClass: "asset",
    color: "sky",
    description: "GCash, Maya, PayPal and the like",
    group: "cash",
    icon: SmartPhone01Icon,
    label: "E-wallet",
    noun: "e-wallet",
  },
  investment: {
    accountClass: "asset",
    color: "violet",
    description: "Brokerage, funds, retirement",
    group: "investments",
    icon: ChartIncreaseIcon,
    label: "Investment",
    noun: "investment account",
  },
  mortgage: {
    accountClass: "liability",
    color: "amber",
    description: "Home loan",
    group: "loans",
    icon: House03Icon,
    label: "Mortgage",
    noun: "mortgage",
  },
  other_asset: {
    accountClass: "asset",
    color: "slate",
    description: "Anything else you own",
    group: "property",
    icon: Coins01Icon,
    label: "Other asset",
    noun: "asset",
  },
  other_liability: {
    accountClass: "liability",
    color: "slate",
    description: "Anything else you owe",
    group: "loans",
    icon: ReceiptDollarIcon,
    label: "Other liability",
    noun: "liability",
  },
  payable: {
    accountClass: "liability",
    color: "stone",
    description: "Money you owe someone",
    group: "loans",
    icon: Invoice01Icon,
    label: "Payable",
    noun: "payable",
  },
  personal_loan: {
    accountClass: "liability",
    color: "rose",
    description: "Borrowed money with repayments",
    group: "loans",
    icon: HandCoinsIcon,
    label: "Personal loan",
    noun: "personal loan",
  },
  property: {
    accountClass: "asset",
    color: "amber",
    description: "Home or land",
    group: "property",
    icon: House01Icon,
    label: "Property",
    noun: "property",
  },
  receivable: {
    accountClass: "asset",
    color: "teal",
    description: "Money owed to you",
    group: "property",
    icon: MoneyReceive01Icon,
    label: "Receivable",
    noun: "receivable",
  },
  vehicle: {
    accountClass: "asset",
    color: "orange",
    description: "Cars, motorcycles",
    group: "property",
    icon: Car01Icon,
    label: "Vehicle",
    noun: "vehicle",
  },
};

export const ACCOUNT_GROUPS: {
  key: AccountGroup;
  label: string;
  liability: boolean;
}[] = [
  { key: "cash", label: "Cash & bank", liability: false },
  { key: "investments", label: "Investments", liability: false },
  { key: "property", label: "Property & other assets", liability: false },
  { key: "credit", label: "Credit cards", liability: true },
  { key: "loans", label: "Loans & payables", liability: true },
];

const FALLBACK: AccountKind = ACCOUNT_KINDS.other_asset;

export const accountKind = (type: string): AccountKind =>
  (ACCOUNT_KINDS as Record<string, AccountKind>)[type] ?? FALLBACK;

export const accountTint = (account: {
  accountType: string;
  color: string | null;
}): string => account.color ?? accountKind(account.accountType).color;
