import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as OrpcModule from "@/utils/orpc";

const bulkUpdate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: toast },
}));
vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof OrpcModule>();
  return { ...actual, client: { transactions: { bulkUpdate } } };
});

const { createQueryClient } = await import("@/utils/orpc");
const { BulkEditDialog } = await import("./bulk-edit-dialog");
const CATEGORY = "00000000-0000-4000-8000-000000000001";
const ID = "00000000-0000-4000-8000-000000000002";
const SECOND_ID = "00000000-0000-4000-8000-000000000003";
const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);
const openDialog = (transactionIds = [ID]) => {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <BulkEditDialog
      activeOrganizationId="household"
      categories={[{ archivedAt: null, id: CATEGORY, name: "Groceries" }]}
      tags={[]}
      transactionIds={transactionIds}
      open
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />,
    { wrapper: Wrapper }
  );
  return { onOpenChange, onSaved };
};
beforeEach(() => {
  bulkUpdate.mockReset();
  toast.mockReset();
});

describe("BulkEditDialog", () => {
  it("requires a change and confirms the selected count before submitting", async () => {
    const user = userEvent.setup();
    const { onSaved } = openDialog();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(
      await screen.findByRole("option", { name: "Keep current" })
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Update 1 transaction?")).toBeInTheDocument();
    expect(bulkUpdate).not.toHaveBeenCalled();
    bulkUpdate.mockResolvedValue({
      categoryKept: [],
      skipped: [{ reason: "split", transactionId: ID }],
      updated: [],
    });
    await user.click(screen.getByRole("button", { name: "Confirm update" }));
    await waitFor(() =>
      expect(bulkUpdate).toHaveBeenCalledWith({
        addTagIds: [],
        categoryId: CATEGORY,
        removeTagIds: [],
        transactionIds: [ID],
      })
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Updated 0 of 1", type: "error" })
      )
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("uses singular for one successful update", async () => {
    const user = userEvent.setup();
    openDialog();
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    bulkUpdate.mockResolvedValue({
      categoryKept: [],
      skipped: [],
      updated: [ID],
    });
    await user.click(screen.getByRole("button", { name: "Confirm update" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Updated 1 transaction",
          type: "success",
        })
      )
    );
  });

  it("reports partial results with skipped reasons", async () => {
    const user = userEvent.setup();
    openDialog([ID, SECOND_ID]);
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Update 2 transactions?")).toBeInTheDocument();
    bulkUpdate.mockResolvedValue({
      categoryKept: [],
      skipped: [{ reason: "archived", transactionId: SECOND_ID }],
      updated: [ID],
    });
    await user.click(screen.getByRole("button", { name: "Confirm update" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "1 was archived",
          title: "Updated 1 of 2",
          type: "warning",
        })
      )
    );
  });

  it("warns when split categories were kept despite successful tag edits", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSaved } = openDialog([ID, SECOND_ID]);
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    bulkUpdate.mockResolvedValue({
      categoryKept: [ID, SECOND_ID],
      skipped: [],
      updated: [ID, SECOND_ID],
    });
    await user.click(screen.getByRole("button", { name: "Confirm update" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "2 split transactions kept their categories",
          title: "Updated 2 of 2",
          type: "warning",
        })
      )
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("keeps the dialog open on request errors", async () => {
    const user = userEvent.setup();
    openDialog();
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    bulkUpdate.mockRejectedValue(new Error("Connection lost"));
    await user.click(screen.getByRole("button", { name: "Confirm update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection lost"
    );
    expect(screen.getByText("Update 1 transaction?")).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });
});
