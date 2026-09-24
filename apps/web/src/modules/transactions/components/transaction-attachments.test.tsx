import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___lib_upload from "@/lib/upload";

const toast = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
vi.mock("@masdan/ui/components/toast", () => ({ toastManager: toast }));

const rpc = vi.hoisted(() => ({
  attach: vi.fn(),
  deleteFile: vi.fn(),
  downloadUrl: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/utils/orpc", () => ({
  client: {
    attachments: {
      attach: rpc.attach,
      downloadUrl: rpc.downloadUrl,
      list: rpc.list,
      remove: rpc.remove,
    },
    files: { deleteFile: rpc.deleteFile },
  },
}));

const uploadFile = vi.hoisted(() =>
  vi.fn<typeof TypeImport___lib_upload.uploadFile>()
);
vi.mock("@/lib/upload", () => ({ uploadFile }));

/** Grants by permission key, e.g. `file:delete:any`; everything else is denied. */
const household = vi.hoisted(() => ({ grants: new Set<string>() }));
vi.mock("@/hooks/use-household", () => ({
  useHousehold: () => ({
    can: (request: Record<string, string[]>) =>
      Object.entries(request).every(([resource, actions]) =>
        actions.every((action) => household.grants.has(`${resource}:${action}`))
      ),
    session: { user: { id: "user-1" } },
  }),
}));

const { TransactionAttachments } = await import("./transaction-attachments");

const TRANSACTION = "00000000-0000-4000-8000-000000000001";

const OWNER_GRANTS = [
  "file:create",
  "file:read",
  "file:delete",
  "file:delete:any",
  "transaction:read",
  "transaction:update",
];
const MEMBER_GRANTS = [
  "file:create",
  "file:read",
  "file:delete",
  "transaction:read",
  "transaction:update",
];
const VIEWER_GRANTS = ["file:read", "transaction:read"];

const attachment = (overrides: Record<string, unknown> = {}) => ({
  contentType: "application/pdf",
  createdAt: new Date("2026-01-05T00:00:00Z"),
  id: "file-1",
  name: "receipt.pdf",
  size: 2048,
  status: "ready",
  transactionId: TRANSACTION,
  userId: "user-1",
  ...overrides,
});

const renderAttachments = ({ editable = true } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <TransactionAttachments editable={editable} transactionId={TRANSACTION} />,
    { wrapper: Wrapper }
  );
};

const pdf = (name = "invoice.pdf") =>
  new File([new Uint8Array(8)], name, { type: "application/pdf" });

beforeEach(() => {
  household.grants = new Set(OWNER_GRANTS);
  for (const fn of Object.values(rpc)) {
    fn.mockReset();
  }
  uploadFile.mockReset();
  toast.add.mockReset();
  rpc.list.mockResolvedValue([attachment()]);
  rpc.deleteFile.mockResolvedValue({ fileId: "file-2" });
});

describe("TransactionAttachments", () => {
  it("shows a placeholder while the list loads", () => {
    rpc.list.mockReturnValue(
      // oxlint-disable-next-line promise/avoid-new
      new Promise(() => {})
    );
    renderAttachments();

    expect(screen.getByRole("region", { name: "Attachments" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });

  it("lists attachments with their size and marks an unavailable one", async () => {
    rpc.list.mockResolvedValue([
      attachment(),
      attachment({
        id: "file-2",
        name: "scan.png",
        size: null,
        status: "failed",
      }),
    ]);
    renderAttachments();

    expect(await screen.findByText("receipt.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download scan.png" })
    ).toBeDisabled();
    expect(rpc.list).toHaveBeenCalledWith({ transactionId: TRANSACTION });
  });

  it("offers a retry when the list fails to load", async () => {
    const user = userEvent.setup();
    rpc.list.mockRejectedValueOnce(new Error("boom"));
    renderAttachments();

    expect(
      await screen.findByText("Couldn’t load attachments.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("receipt.pdf")).toBeInTheDocument();
  });

  it("opens a presigned download", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    rpc.downloadUrl.mockResolvedValue({
      downloadUrl: "https://bucket.test/receipt.pdf?sig",
    });
    renderAttachments();

    await user.click(
      await screen.findByRole("button", { name: "Download receipt.pdf" })
    );

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://bucket.test/receipt.pdf?sig",
        "_blank",
        "noopener,noreferrer"
      )
    );
    expect(rpc.downloadUrl).toHaveBeenCalledWith({
      fileId: "file-1",
      transactionId: TRANSACTION,
    });
    open.mockRestore();
  });

  it("toasts when a download can't be prepared", async () => {
    const user = userEvent.setup();
    rpc.downloadUrl.mockRejectedValue(new Error("File upload is not complete"));
    renderAttachments();

    await user.click(
      await screen.findByRole("button", { name: "Download receipt.pdf" })
    );

    await waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "File upload is not complete",
          type: "error",
        })
      )
    );
  });

  it("uploads, then links, then refreshes the list", async () => {
    const user = userEvent.setup();
    let finishUpload: (() => void) | undefined;
    uploadFile.mockImplementation((_file, options) => {
      options?.onStateChange?.("uploading");
      options?.onProgress?.(0.4);
      // oxlint-disable-next-line promise/avoid-new
      return new Promise((resolve) => {
        finishUpload = () => {
          options?.onStateChange?.("done");
          resolve({ id: "file-2" } as Awaited<
            ReturnType<typeof TypeImport___lib_upload.uploadFile>
          >);
        };
      });
    });
    rpc.attach.mockResolvedValue(attachment({ id: "file-2" }));
    renderAttachments();
    await screen.findByText("receipt.pdf");

    await user.upload(screen.getByLabelText("Add attachments"), pdf());

    expect(await screen.findByText("Uploading… 40%")).toBeInTheDocument();
    rpc.list.mockResolvedValue([
      attachment(),
      attachment({ id: "file-2", name: "invoice.pdf" }),
    ]);
    finishUpload?.();

    expect(
      await screen.findByRole("button", { name: "Download invoice.pdf" })
    ).toBeInTheDocument();
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "invoice.pdf" }),
      expect.anything()
    );
    expect(rpc.attach).toHaveBeenCalledWith({
      fileId: "file-2",
      transactionId: TRANSACTION,
    });
    expect(screen.queryByText(/Uploading/u)).not.toBeInTheDocument();
    expect(rpc.deleteFile).not.toHaveBeenCalled();
  });

  it("deletes an upload the API refused to link and shows why", async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValue({ id: "file-2" } as Awaited<
      ReturnType<typeof TypeImport___lib_upload.uploadFile>
    >);
    rpc.attach.mockRejectedValue(
      new Error("Restore the transaction before changing its attachments")
    );
    renderAttachments();
    await screen.findByText("receipt.pdf");

    await user.upload(screen.getByLabelText("Add attachments"), pdf());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Restore the transaction before changing its attachments"
    );
    expect(rpc.deleteFile).toHaveBeenCalledWith({ fileId: "file-2" });

    await user.click(
      screen.getByRole("button", { name: "Dismiss invoice.pdf" })
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an upload failure without linking anything", async () => {
    const user = userEvent.setup();
    uploadFile.mockRejectedValue(new Error("Upload failed with status 403"));
    renderAttachments();
    await screen.findByText("receipt.pdf");

    await user.upload(screen.getByLabelText("Add attachments"), pdf());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload failed with status 403"
    );
    expect(rpc.attach).not.toHaveBeenCalled();
    expect(rpc.deleteFile).not.toHaveBeenCalled();
  });

  it("removes an attachment after confirming", async () => {
    const user = userEvent.setup();
    rpc.remove.mockResolvedValue({ fileId: "file-1" });
    renderAttachments();

    await user.click(
      await screen.findByRole("button", { name: "Remove receipt.pdf" })
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("deleted from storage");
    rpc.list.mockResolvedValue([]);
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(rpc.remove).toHaveBeenCalledWith({
        fileId: "file-1",
        transactionId: TRANSACTION,
      })
    );
    expect(
      await screen.findByText("Add receipts or other documents for this entry.")
    ).toBeInTheDocument();
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Attachment removed", type: "success" })
    );
  });

  it("keeps the attachment and toasts when removal fails", async () => {
    const user = userEvent.setup();
    rpc.remove.mockRejectedValue(new Error("Missing permission"));
    renderAttachments();

    await user.click(
      await screen.findByRole("button", { name: "Remove receipt.pdf" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Missing permission", type: "error" })
      )
    );
    expect(screen.getByText("receipt.pdf")).toBeInTheDocument();
  });

  it("lets a viewer download but not add or remove", async () => {
    household.grants = new Set(VIEWER_GRANTS);
    renderAttachments();

    expect(
      await screen.findByRole("button", { name: "Download receipt.pdf" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Remove receipt.pdf" })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add attachments")).not.toBeInTheDocument();
  });

  it("renders nothing for a viewer when there is nothing attached", async () => {
    household.grants = new Set(VIEWER_GRANTS);
    rpc.list.mockResolvedValue([]);
    const { container } = renderAttachments();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("lets a member remove only their own attachments", async () => {
    household.grants = new Set(MEMBER_GRANTS);
    rpc.list.mockResolvedValue([
      attachment(),
      attachment({ id: "file-2", name: "theirs.pdf", userId: "user-2" }),
    ]);
    renderAttachments();

    expect(
      await screen.findByRole("button", { name: "Remove receipt.pdf" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove theirs.pdf" })
    ).not.toBeInTheDocument();
  });

  it("is read-only for an archived transaction", async () => {
    renderAttachments({ editable: false });

    expect(
      await screen.findByRole("button", { name: "Download receipt.pdf" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove receipt.pdf" })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add attachments")).not.toBeInTheDocument();
  });
});
