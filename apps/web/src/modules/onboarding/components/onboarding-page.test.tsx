import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const accountsList = vi.hoisted(() => vi.fn());
const currenciesList = vi.hoisted(() => vi.fn());
const updateProfile = vi.hoisted(() => vi.fn());
const updateOrganization = vi.hoisted(() => vi.fn());
const actions = vi.hoisted(() => ({
  compose: vi.fn(),
  composeAccount: vi.fn(),
  inspect: vi.fn(),
  openCommandMenu: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { list: accountsList },
      currencies: { list: currenciesList },
      households: { updateProfile },
    }),
  };
});
vi.mock("@/lib/auth-client", () => ({
  authClient: { organization: { update: updateOrganization } },
}));
vi.mock("@/components/app-actions", () => ({ useAppActions: () => actions }));

const { OnboardingPage, suggestedTimezone } = await import("./onboarding-page");

const PHP = {
  code: "PHP",
  minorUnits: 2,
  name: "Philippine Peso",
  symbol: "₱",
  symbolNative: "₱",
};
const PROFILE = { defaultCurrency: PHP, timezone: "Asia/Manila" };

const account = (id: string, name: string) => ({
  accountClass: "asset",
  accountType: "bank",
  archivedAt: null,
  availableCredit: null,
  balance: "1500.00",
  cardLastFour: null,
  cardNetwork: null,
  cardProductKey: null,
  color: null,
  currencyCode: "PHP",
  id,
  institution: null,
  institutionId: null,
  name,
  paymentDueDay: null,
  utilization: null,
});

const renderStep = (
  step: "household" | "account" | "done",
  onStep = vi.fn()
) => {
  renderWithProviders(
    <OnboardingPage
      activeOrganizationId="household-a"
      householdName="K1's Household"
      onStep={onStep}
      profile={PROFILE}
      step={step}
    />
  );
  return onStep;
};

beforeEach(() => {
  vi.clearAllMocks();
  currenciesList.mockResolvedValue([PHP]);
  accountsList.mockResolvedValue([]);
  updateOrganization.mockResolvedValue({ data: {}, error: null });
  updateProfile.mockImplementation(
    (input: { defaultCurrency: string; timezone: string }) =>
      Promise.resolve({ defaultCurrency: PHP, timezone: input.timezone })
  );
});

describe("household step", () => {
  it("renames the household and saves its money defaults", async () => {
    const user = userEvent.setup();
    const onStep = renderStep("household");

    const name = await screen.findByLabelText("Household name");
    expect(name).toHaveValue("K1's Household");
    await user.clear(name);
    await user.type(name, "Mallari Home");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await vi.waitFor(() => expect(onStep).toHaveBeenCalledWith("account"));
    expect(updateOrganization).toHaveBeenCalledWith({
      data: { name: "Mallari Home" },
      organizationId: "household-a",
    });
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ defaultCurrency: "PHP" })
    );
  });

  it("leaves the name alone when it is unchanged", async () => {
    const user = userEvent.setup();
    const onStep = renderStep("household");

    await screen.findByLabelText("Household name");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await vi.waitFor(() => expect(onStep).toHaveBeenCalledWith("account"));
    expect(updateOrganization).not.toHaveBeenCalled();
  });

  it("stays put when saving the defaults fails", async () => {
    const user = userEvent.setup();
    updateProfile.mockRejectedValue(new Error("nope"));
    const onStep = renderStep("household");

    await screen.findByLabelText("Household name");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await vi.waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(onStep).not.toHaveBeenCalled();
  });
});

describe("account step", () => {
  it("offers to add an account or skip when there are none", async () => {
    const user = userEvent.setup();
    const onStep = renderStep("account");

    await user.click(
      await screen.findByRole("button", { name: "Add an account" })
    );
    expect(actions.composeAccount).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onStep).toHaveBeenCalledWith("done");
  });

  it("lists added accounts and moves on", async () => {
    const user = userEvent.setup();
    accountsList.mockResolvedValue([account("a1", "BPI Savings")]);
    const onStep = renderStep("account");

    expect(await screen.findByText("BPI Savings")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Skip for now" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onStep).toHaveBeenCalledWith("done");
  });
});

describe("done step", () => {
  it("names the household and links to the overview", async () => {
    renderStep("done");

    expect(
      await screen.findByText(/K1's Household is ready/u)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to your overview" })
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.queryByRole("link", { name: "Skip setup" })
    ).not.toBeInTheDocument();
  });
});

describe("suggestedTimezone", () => {
  it("uses the browser's zone when the runtime knows it", () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(suggestedTimezone("Asia/Manila")).toBe(detected);
  });

  it("falls back when the browser reports an unknown zone", () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({
        timeZone: "Mars/Olympus",
      } as Intl.ResolvedDateTimeFormatOptions);
    expect(suggestedTimezone("Asia/Manila")).toBe("Asia/Manila");
    spy.mockRestore();
  });
});
