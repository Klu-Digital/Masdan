import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___utils_orpc from "@/utils/orpc";

const listForCurrentUser = vi.hoisted(() => vi.fn());
const acceptInvitation = vi.hoisted(() => vi.fn());
const rejectInvitation = vi.hoisted(() => vi.fn());
const setActive = vi.hoisted(() => vi.fn());
const addToast = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: { invitations: { listForCurrentUser } },
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: { acceptInvitation, rejectInvitation, setActive },
  },
}));

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: addToast },
}));

const { createQueryClient } = await import("@/utils/orpc");
const { default: InvitationInbox } =
  await import("@/modules/household/components/invitation-inbox");

const invitation = {
  createdAt: new Date("2026-09-18T00:00:00Z"),
  expired: false,
  expiresAt: new Date("2026-09-20T00:00:00Z"),
  id: "invitation-1",
  organizationId: "household-1",
  organizationName: "Mallari Household",
  role: "member",
  status: "pending",
};

const expiredInvitation = {
  ...invitation,
  expired: true,
  expiresAt: new Date("2026-09-15T00:00:00Z"),
  id: "invitation-expired",
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderInbox = () => render(<InvitationInbox />, { wrapper: Wrapper });

beforeEach(() => {
  listForCurrentUser.mockReset();
  acceptInvitation.mockReset().mockResolvedValue({ error: null });
  rejectInvitation.mockReset().mockResolvedValue({ error: null });
  setActive.mockReset().mockResolvedValue({ error: null });
  addToast.mockReset();
});

describe("InvitationInbox", () => {
  it("shows a loading state before invitations arrive", () => {
    const pending = Promise.withResolvers<unknown>();
    listForCurrentUser.mockReturnValue(pending.promise);
    renderInbox();

    expect(screen.getByText("Household invitations")).toBeInTheDocument();
    expect(
      screen.queryByText("No pending invitations")
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no pending invitations", async () => {
    listForCurrentUser.mockResolvedValue([]);
    renderInbox();

    expect(
      await screen.findByText("No pending invitations")
    ).toBeInTheDocument();
  });

  it("shows active invitations and makes expired invitations non-actionable", async () => {
    listForCurrentUser.mockResolvedValue([invitation, expiredInvitation]);
    renderInbox();

    expect(await screen.findAllByText("Mallari Household")).toHaveLength(2);
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(
      screen.getByText("This invitation has expired.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("accepts an invitation, activates its household, and refreshes the inbox", async () => {
    const user = userEvent.setup();
    listForCurrentUser
      .mockResolvedValueOnce([invitation])
      .mockResolvedValueOnce([]);
    renderInbox();

    await user.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(acceptInvitation).toHaveBeenCalledWith({
        invitationId: "invitation-1",
      });
      expect(setActive).toHaveBeenCalledWith({
        organizationId: "household-1",
      });
      expect(screen.getByText("No pending invitations")).toBeInTheDocument();
    });
  });

  it("declines an invitation and refreshes the inbox", async () => {
    const user = userEvent.setup();
    listForCurrentUser
      .mockResolvedValueOnce([invitation])
      .mockResolvedValueOnce([]);
    renderInbox();

    await user.click(await screen.findByRole("button", { name: "Decline" }));

    await waitFor(() => {
      expect(rejectInvitation).toHaveBeenCalledWith({
        invitationId: "invitation-1",
      });
      expect(screen.getByText("No pending invitations")).toBeInTheDocument();
    });
  });

  it("keeps the invitation visible and reports action failures", async () => {
    const user = userEvent.setup();
    listForCurrentUser.mockResolvedValue([invitation]);
    acceptInvitation.mockRejectedValueOnce(new Error("Invitation expired"));
    renderInbox();

    await user.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith({
        title: "Invitation expired",
        type: "error",
      });
    });
    expect(screen.getByText("Mallari Household")).toBeInTheDocument();
  });
});
