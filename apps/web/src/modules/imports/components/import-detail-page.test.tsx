import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const get = vi.hoisted(() => vi.fn());
const rows = vi.hoisted(() => vi.fn());
const commit = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());
const discard = vi.hoisted(() => vi.fn());
const listAccounts = vi.hoisted(() => vi.fn());
const listCategories = vi.hoisted(() => vi.fn());
const listTags = vi.hoisted(() => vi.fn());
const suggestionsEnabled = vi.hoisted(() => vi.fn(() => false));
const importSummary = vi.hoisted(() => vi.fn());
const forImport = vi.hoisted(() => vi.fn());
const resolveImportRows = vi.hoisted(() => vi.fn());
const acceptAllForImport = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: suggestionsEnabled,
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { list: listAccounts },
      categories: { list: listCategories },
      imports: { commit, discard, get, retry, rows },
      suggestions: {
        acceptAllForImport,
        forImport,
        importSummary,
        resolveImportRows,
      },
      tags: { list: listTags },
    }),
  };
});

const { ImportDetailPage } = await import("./import-detail-page");

const baseImport = {
  accountId: "account-1",
  accountName: "BPI Savings",
  currencyCode: "PHP",
  defaultExpenseCategoryId: "groceries",
  defaultIncomeCategoryId: "salary",
  duplicateRows: 1,
  error: null,
  failedStatus: null,
  fileName: "bpi.csv",
  headers: ["Date", "Description", "Amount"],
  id: "import-1",
  importedRows: 0,
  invalidRows: 1,
  mapping: {
    amount: { column: 2, kind: "signed", negativeMeans: "expense" },
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
  previousImport: null,
  status: "ready",
  totalRows: 4,
  validRows: 2,
};

const rowItems = [
  {
    amount: "25000.000000",
    categoryId: "salary",
    description: "Payroll",
    errors: [],
    id: "row-2",
    raw: ["2026-02-01", "Payroll", "25000"],
    rowNumber: 2,
    status: "valid",
    transactionDate: "2026-02-01",
    transactionId: null,
    type: "income",
  },
  {
    amount: null,
    categoryId: null,
    description: "Broken",
    errors: [{ field: "date", message: "Date is empty" }],
    id: "row-3",
    raw: ["", "Broken", "abc"],
    rowNumber: 3,
    status: "invalid",
    transactionDate: null,
    transactionId: null,
    type: null,
  },
];

const renderPage = (canImport = true) =>
  renderWithProviders(
    <ImportDetailPage
      activeOrganizationId="household-1"
      canImport={canImport}
      importId="import-1"
    />
  );

beforeEach(() => {
  for (const mock of [
    get,
    rows,
    commit,
    retry,
    discard,
    importSummary,
    forImport,
    resolveImportRows,
    acceptAllForImport,
  ]) {
    mock.mockReset();
  }
  suggestionsEnabled.mockReturnValue(false);
  listAccounts.mockResolvedValue([
    { archivedAt: null, id: "account-1", name: "BPI Savings" },
  ]);
  listCategories.mockResolvedValue([
    { archivedAt: null, id: "transport", name: "Transport", type: "expense" },
    { archivedAt: null, id: "groceries", name: "Groceries", type: "expense" },
    { archivedAt: null, id: "salary", name: "Salary", type: "income" },
  ]);
  listTags.mockResolvedValue([
    { archivedAt: null, color: "sky", id: "commute", name: "Commute" },
  ]);
  rows.mockResolvedValue({
    items: rowItems,
    page: 1,
    pageSize: 200,
    total: 2,
    totalPages: 1,
  });
});

describe("ImportDetailPage", () => {
  it("shows a processing state while rows are being checked", async () => {
    get.mockResolvedValue({
      ...baseImport,
      status: "validating",
      totalRows: 0,
    });
    renderPage();

    expect(await screen.findByText("Checking every row…")).toBeVisible();
    expect(rows).not.toHaveBeenCalled();
  });

  it("previews counts and row errors, keeping the original cells", async () => {
    get.mockResolvedValue(baseImport);
    renderPage();

    const counts = await screen.findByLabelText("Import counts");
    expect(within(counts).getByText("Ready to import")).toBeVisible();
    expect(within(counts).getByText("Rejected")).toBeVisible();
    expect(within(counts).getByText("Duplicates skipped")).toBeVisible();

    const table = await screen.findByRole("table", { name: "Import rows" });
    expect(within(table).getByText("Date is empty")).toBeVisible();
    expect(within(table).getByText(/· Broken · abc/u)).toBeVisible();
    expect(within(table).getByText("Payroll")).toBeVisible();
  });

  it("shows which rule categorized a row and why", async () => {
    get.mockResolvedValue(baseImport);
    rows.mockResolvedValue({
      items: [
        {
          ...rowItems[0],
          amount: "245.000000",
          categoryId: "transport",
          description: "GRAB*RIDE",
          id: "row-4",
          ruleApplication: {
            categoryId: "transport",
            conditions: {
              accountId: null,
              amountMax: null,
              amountMin: null,
              text: { operator: "contains", value: "grab" },
              type: "expense",
            },
            ruleId: "rule-1",
            ruleName: "Grab rides",
            tagIds: ["commute"],
          },
          type: "expense",
        },
      ],
      page: 1,
      pageSize: 200,
      total: 1,
      totalPages: 1,
    });
    renderPage();

    const table = await screen.findByRole("table", { name: "Import rows" });
    expect(within(table).getByText("Grab rides")).toBeVisible();
    expect(
      await within(table).findByText(
        /Description contains “grab” · Money out · Sets Transport · Adds Commute/u
      )
    ).toBeVisible();
  });

  it("filters to rows that need attention", async () => {
    get.mockResolvedValue(baseImport);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("tab", { name: "Needs attention" })
    );
    await waitFor(() =>
      expect(rows).toHaveBeenLastCalledWith({
        importId: "import-1",
        pageSize: 200,
        statuses: ["invalid"],
        suggestionPending: false,
      })
    );
  });

  it("commits the valid rows", async () => {
    get.mockResolvedValue(baseImport);
    commit.mockResolvedValue({ ...baseImport, status: "committing" });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Import 2 transactions" })
    );
    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith({ importId: "import-1" })
    );
  });

  it("hides import actions from a read-only member", async () => {
    get.mockResolvedValue(baseImport);
    renderPage(false);

    await screen.findByRole("table", { name: "Import rows" });
    expect(
      screen.queryByRole("button", { name: "Import 2 transactions" })
    ).not.toBeInTheDocument();
  });

  it("reports the result of a completed import", async () => {
    get.mockResolvedValue({
      ...baseImport,
      importedRows: 2,
      status: "completed",
      validRows: 0,
    });
    renderPage();

    expect(await screen.findByText("2 transactions imported")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View transactions" })
    ).toBeVisible();
    const counts = screen.getByLabelText("Import counts");
    expect(within(counts).getByText("Imported")).toBeVisible();
  });

  it("warns when the same file was imported before", async () => {
    get.mockResolvedValue({
      ...baseImport,
      previousImport: { committedAt: new Date(), id: "import-0" },
    });
    renderPage();

    expect(
      await screen.findByText("This file was imported before")
    ).toBeVisible();
  });

  it("retries a failed import", async () => {
    get.mockResolvedValue({
      ...baseImport,
      error: "The uploaded file is no longer available. Upload it again.",
      failedStatus: "validating",
      status: "failed",
    });
    retry.mockResolvedValue({ ...baseImport, status: "validating" });
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText(
        "The uploaded file is no longer available. Upload it again."
      )
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith({ importId: "import-1" })
    );
  });

  it("offers no suggestions while the flag is off", async () => {
    get.mockResolvedValue(baseImport);
    renderPage();

    await screen.findByRole("table", { name: "Import rows" });
    expect(screen.queryByRole("tab", { name: "Suggestions" })).toBeNull();
    expect(screen.queryByLabelText("Suggestions")).toBeNull();
    expect(importSummary).not.toHaveBeenCalled();
  });

  it("asks for suggestions on rows still on the default category", async () => {
    suggestionsEnabled.mockReturnValue(true);
    get.mockResolvedValue(baseImport);
    importSummary.mockResolvedValue({ pending: 0, unsuggested: 2 });
    forImport.mockResolvedValue({
      pending: 1,
      status: "suggested",
      unsuggested: 0,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Suggest categories" })
    );
    await waitFor(() =>
      expect(forImport).toHaveBeenCalledWith({ importId: "import-1" })
    );
  });

  it("accepts, edits or rejects a row's suggestion", async () => {
    suggestionsEnabled.mockReturnValue(true);
    get.mockResolvedValue(baseImport);
    importSummary.mockResolvedValue({ pending: 1, unsuggested: 0 });
    resolveImportRows.mockResolvedValue({
      accepted: 1,
      pending: 0,
      rejected: 0,
      unsuggested: 0,
    });
    rows.mockResolvedValue({
      items: [
        {
          ...rowItems[0],
          amount: "245.000000",
          categoryId: "groceries",
          description: "GRAB RIDE",
          id: "row-4",
          ruleApplication: null,
          suggestion: {
            status: "pending",
            suggested: { categoryId: "transport", tagIds: ["commute"] },
            suggestedAt: "2026-09-28T00:00:00.000Z",
          },
          suggestionApplication: null,
          type: "expense",
        },
      ],
      page: 1,
      pageSize: 200,
      total: 1,
      totalPages: 1,
    });
    const user = userEvent.setup();
    renderPage();

    const table = await screen.findByRole("table", { name: "Import rows" });
    expect(
      await within(table).findByText("Transport · #Commute")
    ).toBeVisible();
    // Annotated only: the row still shows the category it would import as.
    expect(within(table).getByText("Groceries")).toBeVisible();
    expect(screen.getByText(/1 suggestion awaits your review/u)).toBeVisible();

    await user.click(within(table).getByRole("button", { name: "Edit" }));
    await user.click(within(table).getByRole("button", { name: "Commute" }));
    await user.click(within(table).getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(resolveImportRows).toHaveBeenCalledWith({
        decisions: [
          {
            action: "accept",
            categoryId: "transport",
            rowId: "row-4",
            tagIds: [],
          },
        ],
        importId: "import-1",
      })
    );

    await user.click(within(table).getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(resolveImportRows).toHaveBeenLastCalledWith({
        decisions: [{ action: "reject", rowId: "row-4" }],
        importId: "import-1",
      })
    );
  });

  it("accepts every pending suggestion at once", async () => {
    suggestionsEnabled.mockReturnValue(true);
    get.mockResolvedValue(baseImport);
    importSummary.mockResolvedValue({ pending: 3, unsuggested: 0 });
    acceptAllForImport.mockResolvedValue({
      accepted: 3,
      pending: 0,
      rejected: 0,
      unsuggested: 0,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Accept all 3" })
    );
    await waitFor(() =>
      expect(acceptAllForImport).toHaveBeenCalledWith({ importId: "import-1" })
    );
  });
});
