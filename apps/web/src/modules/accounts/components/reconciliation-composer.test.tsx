import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";
import { createQueryClient } from "@/utils/orpc";

const preview = vi.hoisted(() => vi.fn());
const reconcile = vi.hoisted(() => vi.fn());
vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { previewReconciliation: preview, reconcile },
    }),
  };
});
vi.mock("@/hooks/use-household", () => ({
  useHousehold: () => ({
    activeOrganizationId: "home",
    currency: "PHP",
    timezone: "Asia/Manila",
  }),
}));
vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn() },
}));
vi.mock("@/components/date-picker", () => ({
  DatePicker: ({
    id,
    value,
    onValueChange,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <input
      id={id}
      type="date"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

const { ReconciliationComposer } = await import("./reconciliation-composer");
const account = {
  balance: "24500",
  currencyCode: "PHP",
  id: "account",
  name: "Bank",
  openingBalanceDate: "2026-01-01",
};
const renderForm = () => {
  const onOpenChange = vi.fn();
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  renderWithProviders(
    <ReconciliationComposer
      account={account}
      today="2026-02-01"
      onOpenChange={onOpenChange}
    />,
    queryClient
  );
  return onOpenChange;
};

beforeEach(() => {
  preview.mockReset().mockResolvedValue({ calculatedBalance: "24500" });
  reconcile.mockReset().mockResolvedValue({});
});

it("defaults to household today and confirms the displayed exact adjustment", async () => {
  const onOpenChange = renderForm();
  const user = userEvent.setup();
  const actual = await screen.findByRole("textbox", { name: "Actual balance" });
  expect(screen.getByLabelText("Effective date")).toHaveValue("2026-02-01");
  await user.type(actual, "25120");
  await user.type(
    screen.getByRole("textbox", { name: /Note or reason/u }),
    "Bank app"
  );
  expect(
    await screen.findByRole("group", { name: "Adjustment amount" })
  ).toHaveTextContent(/620/u);
  await user.click(
    screen.getByRole("button", { name: "Confirm reconciliation" })
  );
  await waitFor(() =>
    expect(reconcile).toHaveBeenCalledWith({
      accountId: "account",
      balance: "25120",
      effectiveDate: "2026-02-01",
      expectedBalance: "24500",
      notes: "Bank app",
    })
  );
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("shows zero-delta checkpoint copy and disables confirmation before opening", async () => {
  renderForm();
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Actual balance" }),
    "24500"
  );
  expect(
    await screen.findByText(/Only a balance checkpoint/u)
  ).toBeInTheDocument();
  const date = screen.getByLabelText("Effective date");
  await user.clear(date);
  await user.type(date, "2025-12-31");
  expect(
    await screen.findByText(/Choose a date on or after/u)
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Confirm reconciliation" })
  ).toBeDisabled();
});

it("retains values after a stale confirmation and requires confirmation of the refreshed balance", async () => {
  preview
    .mockResolvedValueOnce({ calculatedBalance: "24500" })
    .mockResolvedValue({ calculatedBalance: "24600" });
  reconcile
    .mockRejectedValueOnce({ code: "CONFLICT", message: "Balance changed" })
    .mockResolvedValue({});
  renderForm();
  const user = userEvent.setup();
  const input = await screen.findByRole("textbox", { name: "Actual balance" });
  await user.type(input, "25120");
  await user.click(
    screen.getByRole("button", { name: "Confirm reconciliation" })
  );
  await waitFor(() =>
    expect(
      screen.getByRole("group", { name: "Adjustment amount" })
    ).toHaveTextContent(/520/u)
  );
  expect(input).toHaveValue("25120");
  expect(reconcile).toHaveBeenCalledTimes(1);
  await user.click(
    screen.getByRole("button", { name: "Confirm reconciliation" })
  );
  await waitFor(() =>
    expect(reconcile).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedBalance: "24600" })
    )
  );
});

it("disables confirmation until the effective-date preview finishes", async () => {
  const pending = Promise.withResolvers<{ calculatedBalance: string }>();
  preview.mockReturnValue(pending.promise);
  renderForm();
  await userEvent
    .setup()
    .type(
      await screen.findByRole("textbox", { name: "Actual balance" }),
      "25120"
    );
  expect(
    screen.getByRole("button", { name: "Confirm reconciliation" })
  ).toBeDisabled();
  pending.resolve({ calculatedBalance: "24500" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirm reconciliation" })
    ).toBeEnabled()
  );
});

it("shows a negative adjustment without calling it spending", async () => {
  renderForm();
  await userEvent
    .setup()
    .type(
      await screen.findByRole("textbox", { name: "Actual balance" }),
      "24000"
    );
  const adjustment = await screen.findByRole("group", {
    name: "Adjustment amount",
  });
  expect(adjustment).toHaveTextContent(/500/u);
  expect(adjustment).toHaveTextContent("not your income or spending");
  expect(screen.getByLabelText("Actual balance")).toHaveAccessibleDescription(
    /bank app or statement/u
  );
});

it("locks inputs and confirmation while saving", async () => {
  const pending = Promise.withResolvers<object>();
  reconcile.mockReturnValue(pending.promise);
  const onOpenChange = renderForm();
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Actual balance" }),
    "25120"
  );
  const confirm = screen.getByRole("button", {
    name: "Confirm reconciliation",
  });
  await user.click(confirm);
  expect(
    screen.getByRole("textbox", { name: "Actual balance" })
  ).toBeDisabled();
  expect(confirm).toBeDisabled();
  expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  pending.resolve({});
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("keeps entered values and shows a save failure inline", async () => {
  reconcile.mockRejectedValue(new Error("offline"));
  renderForm();
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole("textbox", { name: "Actual balance" }),
    "25120"
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm reconciliation" })
  );
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Actual balance" })).toHaveValue(
    "25120"
  );
});

it("does not allow confirmation without a successful preview", async () => {
  preview.mockRejectedValue(new Error("offline"));
  renderForm();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not calculate the balance"
  );
  expect(
    screen.getByRole("button", { name: "Confirm reconciliation" })
  ).toBeDisabled();
  expect(reconcile).not.toHaveBeenCalled();
});
