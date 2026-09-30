import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const create = vi.hoisted(() => vi.fn());
const catalog = vi.hoisted(() => vi.fn());
const currenciesList = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { create },
      currencies: { list: currenciesList },
      interest: { catalog },
    }),
  };
});

const { AccountComposer } = await import("./account-composer");

const MARI_SAVINGS = "0192d5a0-0000-7000-8000-000000000001";
const TONIK_TD = "0192d5a0-0000-7000-8000-000000000002";

const terms = {
  bonusAnnualRate: null,
  calculationBasis: "eod",
  conditionSummary: null,
  creditFrequency: "daily",
  dayCountBasis: "actual",
  interestCapBalance: null,
  minimumBalance: null,
  tierMode: "marginal",
  tiers: [
    { annualRate: "3.25", minBalance: "0" },
    { annualRate: "3.75", minBalance: "1000000" },
  ],
  withholdingTaxRate: "20.000000",
};

const institution = (id: string, name: string) => ({
  aliases: [],
  brandColor: "#f5541f",
  countryCode: "PH",
  id,
  institutionType: "digital_bank",
  key: `ph-${id}`,
  logoKey: id,
  name,
  shortName: name,
  websiteUrl: null,
});

const CATALOG = {
  institutions: [
    institution("mari", "MariBank"),
    institution("tonik", "Tonik"),
  ],
  products: [
    {
      aliases: [],
      channelInstitutionId: null,
      currencyCode: "PHP",
      id: MARI_SAVINGS,
      institutionId: "mari",
      key: "ph-maribank-savings",
      name: "Savings",
      notes: null,
      productType: "savings",
      schedules: [
        {
          effectiveFrom: null,
          effectiveTo: null,
          id: "schedule-mari",
          sourceCheckedAt: "2026-09-30",
          sourceUrl: "https://www.maribank.ph/fees-rates",
          term: null,
          terms,
        },
      ],
      sourceUrl: null,
    },
    {
      aliases: [],
      channelInstitutionId: null,
      currencyCode: "PHP",
      id: TONIK_TD,
      institutionId: "tonik",
      key: "ph-tonik-time-deposit",
      name: "Time Deposit",
      notes: null,
      productType: "time_deposit",
      schedules: [
        {
          effectiveFrom: null,
          effectiveTo: null,
          id: "schedule-tonik",
          sourceCheckedAt: "2026-09-30",
          sourceUrl: null,
          term: { count: 6, unit: "month" },
          terms: {
            ...terms,
            bonusAnnualRate: "1.00",
            calculationBasis: "principal",
            conditionSummary: "Keep ₱10,000 in Tonik Savings.",
            creditFrequency: "maturity",
            tierMode: "whole_balance",
            tiers: [{ annualRate: "4.00", minBalance: "0" }],
          },
        },
      ],
      sourceUrl: null,
    },
  ],
};

const startBank = async (user: ReturnType<typeof userEvent.setup>) => {
  renderWithProviders(
    <AccountComposer
      activeOrganizationId="household-1"
      defaults={{ currency: "PHP", members: [], timezone: "Asia/Manila" }}
      onOpenChange={vi.fn()}
      open
      request={{}}
    />
  );
  await user.click(await screen.findByRole("button", { name: /Bank/u }));
  await user.type(await screen.findByLabelText("Name"), "Savings");
};

const chooseProduct = async (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp
) => {
  await user.click(await screen.findByRole("combobox", { name: "Product" }));
  await user.click(await screen.findByRole("option", { name }));
};

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "account-1", name: "Savings" });
  catalog.mockResolvedValue(CATALOG);
  currenciesList.mockResolvedValue([
    {
      code: "PHP",
      minorUnits: 2,
      name: "Philippine Peso",
      symbol: "₱",
      symbolNative: "₱",
    },
  ]);
});

describe("interest on a bank account", () => {
  it("follows a preset and takes its bank as the institution", async () => {
    const user = userEvent.setup();
    await startBank(user);

    await chooseProduct(user, /MariBank · Savings/u);

    expect(await screen.findByText("Up to 3.75%")).toBeVisible();
    const ladder = screen.getByRole("list", { name: "Rates by balance" });
    expect(within(ladder).getByText("First ₱1M")).toBeVisible();
    expect(within(ladder).getByText("3.75%")).toBeVisible();
    expect(screen.getByText("Rates as of September 30, 2026")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        institution: "MariBank",
        institutionId: "mari",
        interest: expect.objectContaining({
          autoPost: true,
          productId: MARI_SAVINGS,
          term: null,
          terms: null,
        }),
      })
    );
  });

  it("overrides the preset's rate for this account only", async () => {
    const user = userEvent.setup();
    await startBank(user);
    await chooseProduct(user, /MariBank · Savings/u);

    await user.click(
      await screen.findByRole("button", { name: "Use a different rate" })
    );
    const rate = screen.getByLabelText("Tier 2 rate, percent a year");
    await user.clear(rate);
    await user.type(rate, "4");
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].interest).toMatchObject({
      productId: MARI_SAVINGS,
      terms: {
        creditFrequency: "daily",
        tiers: [
          { annualRate: "3.25", minBalance: "0" },
          { annualRate: "4", minBalance: "1000000" },
        ],
        withholdingTaxRate: "20",
      },
    });
  });

  it("asks for a time deposit's tenor, then books it with the bonus", async () => {
    const user = userEvent.setup();
    await startBank(user);
    await chooseProduct(user, /Tonik · Time Deposit/u);

    await user.click(screen.getByRole("button", { name: "Add account" }));
    expect(
      await screen.findByText("Choose a tenor", {
        selector: "[data-slot='field-error']",
      })
    ).toBeVisible();
    expect(create).not.toHaveBeenCalled();

    await user.click(screen.getByRole("combobox", { name: "Tenor" }));
    await user.click(await screen.findByRole("option", { name: /6 months/u }));
    await user.click(screen.getByRole("switch", { name: /Count the bonus/u }));
    await user.click(
      screen.getByRole("switch", { name: /Post interest automatically/u })
    );
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].interest).toMatchObject({
      autoPost: false,
      bonusEligible: true,
      productId: TONIK_TD,
      term: { count: 6, unit: "month" },
      terms: null,
    });
  });

  it("takes a custom rate with no preset", async () => {
    const user = userEvent.setup();
    await startBank(user);
    await chooseProduct(user, /Custom rate/u);

    await user.type(
      screen.getByLabelText("Tier 1 rate, percent a year"),
      "2.5"
    );
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].interest).toMatchObject({
      productId: null,
      terms: { tiers: [{ annualRate: "2.5", minBalance: "0" }] },
    });
  });
});
