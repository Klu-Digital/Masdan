import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const updateProfile = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return { client: mockClient({ households: { updateProfile } }) };
});

const { createQueryClient } = await import("@/utils/orpc");
const { HouseholdFinanceCard } =
  await import("@/modules/household/components/household-finance-card");

const PHP = {
  code: "PHP",
  minorUnits: 2,
  name: "Philippine Peso",
  symbol: "₱",
  symbolNative: "₱",
};
const JPY = {
  code: "JPY",
  minorUnits: 0,
  name: "Japanese Yen",
  symbol: "¥",
  symbolNative: "￥",
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderCard = (canManage: boolean) =>
  render(
    <HouseholdFinanceCard
      activeOrganizationId="household-1"
      canManage={canManage}
      currencies={[PHP, JPY]}
      profile={{ defaultCurrency: PHP, timezone: "Asia/Manila" }}
    />,
    { wrapper: Wrapper }
  );

beforeEach(() => {
  updateProfile.mockReset();
  updateProfile.mockResolvedValue({
    defaultCurrency: JPY,
    timezone: "Asia/Tokyo",
  });
});

describe("HouseholdFinanceCard", () => {
  it("shows the profile read-only without manage permission", () => {
    renderCard(false);

    expect(screen.getByText(/Philippine Peso/u)).toBeTruthy();
    expect(screen.getByText("Asia/Manila")).toBeTruthy();
    expect(screen.getByText("Money defaults")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save/u })).toBeNull();
  });

  it("seeds both pickers from the current profile", () => {
    renderCard(true);

    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "PHP — Philippine Peso"
    );
    expect(screen.getByRole("combobox", { name: "Timezone" })).toHaveValue(
      "Asia/Manila"
    );
  });

  it("saves the codes behind the labels the person picked", async () => {
    const user = userEvent.setup();
    renderCard(true);

    const currency = screen.getByRole("combobox", { name: "Currency" });
    await user.clear(currency);
    await user.type(currency, "Japanese");
    await user.click(await screen.findByRole("option", { name: /Japanese/u }));

    await user.click(screen.getByRole("button", { name: /Save/u }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        defaultCurrency: "JPY",
        timezone: "Asia/Manila",
      });
    });
  });
});
