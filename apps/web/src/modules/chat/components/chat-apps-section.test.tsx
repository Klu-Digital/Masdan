import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const enabled = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/hooks/use-feature-flag", () => ({ useFeatureFlag: enabled }));

const rpc = vi.hoisted(() => ({
  createLinkCode: vi.fn(),
  status: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return { client: mockClient({ chatIntegrations: rpc }) };
});

const { ChatAppsSection } = await import("./chat-apps-section");

const telegram = { channel: "telegram", label: "Telegram", link: null };
const whatsapp = { channel: "whatsapp", label: "WhatsApp", link: null };
const linked = {
  ...telegram,
  link: { externalName: "@mj", linkedAt: new Date("2026-09-28") },
};

const renderSection = (canLink = true) =>
  renderWithProviders(
    <ChatAppsSection activeOrganizationId="household-1" canLink={canLink} />
  );

beforeEach(() => {
  enabled.mockReturnValue(true);
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  rpc.status.mockResolvedValue({ channels: [telegram] });
});

describe("ChatAppsSection", () => {
  it("renders nothing while the flag is off", () => {
    enabled.mockReturnValue(false);
    renderSection();

    expect(screen.queryByText("Chat apps")).not.toBeInTheDocument();
    expect(rpc.status).not.toHaveBeenCalled();
  });

  it("issues one code for every unlinked channel", async () => {
    rpc.status.mockResolvedValue({ channels: [telegram, whatsapp] });
    rpc.createLinkCode.mockResolvedValue({
      code: "ABCD-EFGH",
      expiresAt: new Date(Date.now() + 600_000),
    });
    const user = userEvent.setup();
    renderSection();

    await user.click(
      await screen.findByRole("button", { name: "Get link code" })
    );

    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByText("/link ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByText(/Telegram or WhatsApp/u)).toBeInTheDocument();
  });

  it("offers no code to members who cannot add transactions", async () => {
    renderSection(false);

    expect(await screen.findByText("Not linked")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get link code" })
    ).not.toBeInTheDocument();
  });

  it("offers no code once every channel is linked", async () => {
    rpc.status.mockResolvedValue({ channels: [linked] });
    renderSection();

    expect(await screen.findByText(/@mj/u)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get link code" })
    ).not.toBeInTheDocument();
  });

  it("unlinks one channel", async () => {
    rpc.status.mockResolvedValue({ channels: [linked, whatsapp] });
    rpc.unlink.mockResolvedValue({ unlinked: true });
    const user = userEvent.setup();
    renderSection();

    await user.click(
      await screen.findByRole("button", { name: "Unlink Telegram" })
    );

    await waitFor(() =>
      expect(rpc.unlink).toHaveBeenCalledWith({ channel: "telegram" })
    );
  });

  it("says so when the server has no chat app configured", async () => {
    rpc.status.mockResolvedValue({ channels: [] });
    renderSection();

    expect(
      await screen.findByText(/No chat apps are set up/u)
    ).toBeInTheDocument();
  });
});
