import type * as RouterModule from "@tanstack/react-router";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const accountsList = vi.hoisted(() => vi.fn());
const categoriesList = vi.hoisted(() => vi.fn());
const importsList = vi.hoisted(() => vi.fn());
const importsCreate = vi.hoisted(() => vi.fn());
const uploadFile = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { list: accountsList },
      categories: { list: categoriesList },
      imports: { create: importsCreate, list: importsList },
    }),
  };
});
vi.mock("@/lib/upload", () => ({ uploadFile }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useNavigate: () => navigate };
});

const { NewImportPage } = await import("./new-import-page");

const CSV = [
  "Posting Date,Particulars,Withdrawal,Deposit",
  "2026-02-01,Payroll,,25000.00",
  '2026-02-03,"Puregold, Makati",1500.25,',
  "someday,Broken,abc,",
].join("\r\n");

const csvFile = (text = CSV, name = "bpi.csv", type = "text/csv") =>
  new File([text], name, { type });

beforeEach(() => {
  for (const mock of [
    accountsList,
    categoriesList,
    importsList,
    importsCreate,
    uploadFile,
    navigate,
  ]) {
    mock.mockReset();
  }
  accountsList.mockResolvedValue([
    {
      accountType: "bank",
      archivedAt: null,
      color: null,
      currencyCode: "PHP",
      id: "account-1",
      name: "BPI Savings",
      openingBalanceDate: "2026-01-01",
    },
  ]);
  categoriesList.mockResolvedValue([
    { archivedAt: null, id: "groceries", name: "Groceries", type: "expense" },
    { archivedAt: null, id: "salary", name: "Salary", type: "income" },
  ]);
  importsList.mockResolvedValue([
    {
      accountName: "BPI Savings",
      duplicateRows: 1,
      fileName: "older.csv",
      id: "import-0",
      importedRows: 12,
      invalidRows: 2,
      status: "completed",
    },
  ]);
  uploadFile.mockResolvedValue({ id: "file-1" });
  importsCreate.mockResolvedValue({ id: "import-1" });
});

describe("NewImportPage", () => {
  it("previews parsed rows with row-level problems before uploading", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewImportPage activeOrganizationId="household-1" />);

    await user.upload(await screen.findByLabelText("CSV file"), csvFile());

    const preview = await screen.findByRole("table", {
      name: "How the first rows will be read",
    });
    const rows = within(preview).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(
      within(rows[1] as HTMLElement).getByText("2026-02-01")
    ).toBeVisible();
    expect(
      within(rows[2] as HTMLElement).getByText("Puregold, Makati")
    ).toBeVisible();
    expect(
      within(rows[3] as HTMLElement).getByText(
        /Can't read "someday" as Year-Month-Day/u
      )
    ).toBeVisible();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(screen.getByText(/BPI Savings starts on 2026-01-01/u)).toBeVisible();
  });

  it("uploads the file and creates an import with the guessed mapping", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <NewImportPage accountId="account-1" activeOrganizationId="household-1" />
    );

    await user.upload(
      await screen.findByLabelText("CSV file"),
      csvFile(CSV, "bpi.csv", "application/vnd.ms-excel")
    );
    await screen.findByRole("table", {
      name: "How the first rows will be read",
    });
    await user.click(screen.getByRole("button", { name: "Check all rows" }));

    await waitFor(() =>
      expect(importsCreate).toHaveBeenCalledWith({
        accountId: "account-1",
        defaultExpenseCategoryId: "groceries",
        defaultIncomeCategoryId: "salary",
        fileId: "file-1",
        mapping: {
          amount: { creditColumn: 3, debitColumn: 2, kind: "debitCredit" },
          categoryColumn: null,
          dateColumn: 0,
          dateFormat: "ymd",
          decimalSeparator: ".",
          delimiter: ",",
          descriptionColumn: 1,
          hasHeaderRow: true,
          notesColumn: null,
        },
        openingBalanceMode: "reject",
      })
    );
    const uploaded = uploadFile.mock.calls[0]?.[0] as File;
    expect(uploaded.type).toBe("text/csv");
    expect(uploaded.name).toBe("bpi.csv");
    expect(navigate).toHaveBeenCalledWith({
      params: { importId: "import-1" },
      to: "/imports/$importId",
    });
  });

  it("sends the chosen opening-balance handling", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewImportPage activeOrganizationId="household-1" />);

    await user.upload(await screen.findByLabelText("CSV file"), csvFile());
    await user.click(
      await screen.findByRole("radio", {
        name: /Add them as history, keep today’s balance/u,
      })
    );
    await user.click(screen.getByRole("button", { name: "Check all rows" }));

    await waitFor(() =>
      expect(importsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ openingBalanceMode: "rebase" })
      )
    );
  });

  it("rejects a file that is not a CSV", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<NewImportPage activeOrganizationId="household-1" />);

    await user.upload(
      await screen.findByLabelText("CSV file"),
      csvFile("x", "photo.png", "image/png")
    );

    expect(
      await screen.findByText(
        "Choose a .csv file exported from your bank or spreadsheet."
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Check all rows" })
    ).not.toBeInTheDocument();
  });

  it("shows the upload error and stays on the form", async () => {
    uploadFile.mockRejectedValue(new Error("Upload failed with status 403"));
    const user = userEvent.setup();
    renderWithProviders(<NewImportPage activeOrganizationId="household-1" />);

    await user.upload(await screen.findByLabelText("CSV file"), csvFile());
    await user.click(
      await screen.findByRole("button", { name: "Check all rows" })
    );

    expect(
      await screen.findByText("Upload failed with status 403")
    ).toBeVisible();
    expect(importsCreate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("lists recent imports with their counts", async () => {
    renderWithProviders(<NewImportPage activeOrganizationId="household-1" />);

    expect(await screen.findByText("older.csv")).toBeVisible();
    expect(
      screen.getByText(/12 imported · 2 rejected · 1 duplicates/u)
    ).toBeVisible();
  });
});
