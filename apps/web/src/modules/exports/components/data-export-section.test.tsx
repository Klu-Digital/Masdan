import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { renderWithProviders } from "@/test/render";
import type * as TypeImport___utils_orpc from "@/utils/orpc";

const toastAdd = vi.hoisted(() => vi.fn());

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: toastAdd, close: vi.fn(), update: vi.fn() },
}));

const transactions = vi.hoisted(() => vi.fn());
const accounts = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: { exports: { accounts, transactions } },
  };
});

const { DataExportSection } = await import("./data-export-section");
const { exportFileName } = await import("@/modules/exports/download");

const createObjectURL = vi.fn((_blob: Blob) => "blob:export");
const revokeObjectURL = vi.fn();
const clickedDownloads: string[] = [];

beforeEach(() => {
  transactions.mockReset();
  accounts.mockReset();
  toastAdd.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clickedDownloads.length = 0;
  // jsdom implements neither, so the download path needs them supplied.
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function recordDownload(this: HTMLAnchorElement) {
      clickedDownloads.push(this.download);
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DataExportSection", () => {
  it("lists every export dataset", async () => {
    renderWithProviders(
      <DataExportSection householdName="Casa" timeZone="Asia/Manila" />
    );
    await screen.findByText("Export data");

    for (const title of [
      "Transactions",
      "Transaction splits",
      "Transaction tags",
      "Transfers",
      "Accounts",
      "Balance history",
      "Credit-card statements",
      "Categories",
      "Tags",
    ]) {
      expect(
        screen.getByRole("button", { name: `Download ${title} CSV` })
      ).toBeTruthy();
    }
  });

  it("downloads the server's CSV with a BOM under a household-named file", async () => {
    const user = userEvent.setup();
    transactions.mockResolvedValue({
      csv: "id,notes\r\n1,₱ señor\r\n",
      fileName: "transactions.csv",
      rowCount: 1,
    });
    renderWithProviders(
      <DataExportSection householdName="Casa Reyes!" timeZone="Asia/Manila" />
    );

    await user.click(
      await screen.findByRole("button", { name: "Download Transactions CSV" })
    );

    await waitFor(() => {
      expect(clickedDownloads).toHaveLength(1);
    });
    expect(transactions).toHaveBeenCalledTimes(1);
    expect(clickedDownloads[0]).toMatch(
      /^casa-reyes-\d{4}-\d{2}-\d{2}-transactions\.csv$/u
    );
    const [blob] = createObjectURL.mock.calls[0] ?? [];
    expect(blob?.type).toBe("text/csv;charset=utf-8");
    const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("id,notes\r\n1,₱ señor\r\n");
  });

  it("reports a failed export instead of downloading", async () => {
    const user = userEvent.setup();
    accounts.mockRejectedValue(new Error("Missing permission"));
    renderWithProviders(
      <DataExportSection householdName="Casa" timeZone="Asia/Manila" />
    );

    await user.click(
      await screen.findByRole("button", { name: "Download Accounts CSV" })
    );

    await waitFor(() => {
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Missing permission", type: "error" })
      );
    });
    expect(clickedDownloads).toHaveLength(0);
  });
});

describe("exportFileName", () => {
  it("slugs the household name and falls back when nothing is left", () => {
    expect(exportFileName("Casa Reyes", "2026-09-24", "tags.csv")).toBe(
      "casa-reyes-2026-09-24-tags.csv"
    );
    expect(exportFileName("日本", "2026-09-24", "tags.csv")).toBe(
      "household-2026-09-24-tags.csv"
    );
  });
});
