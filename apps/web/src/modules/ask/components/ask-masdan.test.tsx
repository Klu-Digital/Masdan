import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { formatLongDate } from "@/lib/dates";
import { renderWithProviders } from "@/test/render";
import { createQueryClient } from "@/utils/orpc";

const question = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return { client: mockClient({ ask: { cancel, confirm, question } }) };
});

const { AskMasdan: Assistant } = await import("./ask-masdan");
const AskMasdan = () => (
  <Assistant activeOrganizationId="household-1">
    {({ sidebar, trigger }) => (
      <div>
        <button type="button">Navigate elsewhere</button>
        {trigger}
        {sidebar}
      </div>
    )}
  </Assistant>
);

const AssistantShell = () => (
  <Assistant activeOrganizationId="household-1">
    {({ sidebar, trigger }) => (
      <div>
        <Link to="/accounts">Go to accounts</Link>
        {trigger}
        <Outlet />
        {sidebar}
      </div>
    )}
  </Assistant>
);
const OverviewWorkspace = () => <p>Overview workspace</p>;
const AccountsWorkspace = () => <p>Accounts workspace</p>;
const renderNavigableShell = () => {
  const root = createRootRoute({ component: AssistantShell });
  const overview = createRoute({
    component: OverviewWorkspace,
    getParentRoute: () => root,
    path: "/",
  });
  const accounts = createRoute({
    component: AccountsWorkspace,
    getParentRoute: () => root,
    path: "/accounts",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: root.addChildren([overview, accounts]),
  });
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return queryClient;
};

const CATEGORY = "00000000-0000-4000-8000-000000000005";

const spending = {
  answer: {
    context: {
      account: null,
      asOf: null,
      category: "Food & Dining",
      kind: "expense",
      period: {
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        preset: "last_month",
      },
      search: null,
    },
    figures: [
      {
        amounts: [{ amount: "4650.500000", currencyCode: "PHP" }],
        label: "Spending",
      },
    ],
    headline:
      "You spent ₱4,650.50 on Food & Dining from Aug 1, 2026 to Aug 31, 2026 across 3 transactions.",
    intent: "spending",
    link: {
      search: {
        accountIds: [],
        categoryIds: [CATEGORY],
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        search: "",
        types: ["expense"],
      },
      to: "/transactions",
    },
    rows: [],
    rowsLabel: null,
  },
  requestId: "00000000-0000-4000-8000-000000000006",
  status: "answered",
};

const submit = async (text: string) => {
  const user = userEvent.setup();
  renderWithProviders(<AskMasdan />);
  await user.click(await screen.findByRole("button", { name: "Ask Masdan" }));
  await user.type(await screen.findByLabelText("Question"), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
};

beforeEach(() => {
  question.mockReset();
  confirm.mockReset();
  cancel.mockReset();
});

describe("AskMasdan", () => {
  it("opens on demand, fills an example, and preserves the answer after closing", async () => {
    const user = userEvent.setup();
    question.mockResolvedValue(spending);
    renderWithProviders(<AskMasdan />);

    const trigger = await screen.findByRole("button", { name: "Ask Masdan" });
    expect(screen.queryByLabelText("Question")).toBeNull();
    await user.click(trigger);
    expect(
      await screen.findByRole("complementary", { name: "Ask Masdan" })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "How much did we spend on dining last month?",
      })
    );
    expect(screen.getByLabelText("Question")).toHaveValue(
      "How much did we spend on dining last month?"
    );
    expect(question).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(spending.answer.headline)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close Ask Masdan" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: "Ask Masdan" })
      ).toBeNull()
    );
    expect(screen.getByRole("button", { name: "Ask Masdan" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Ask Masdan" }));
    expect(await screen.findByLabelText("Question")).toHaveValue(
      "How much did we spend on dining last month?"
    );
    expect(screen.getByText(spending.answer.headline)).toBeVisible();
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("shows the answer with the period and filters it was computed over", async () => {
    question.mockResolvedValue(spending);

    await submit("how much on dining last month");

    expect(question).toHaveBeenCalledWith({
      question: "how much on dining last month",
    });
    expect(
      await screen.findByText(spending.answer.headline)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${formatLongDate("2026-08-01")} – ${formatLongDate("2026-08-31")}`
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Category: Food & Dining")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open these transactions" });
    const href = decodeURIComponent(link.getAttribute("href") ?? "");
    expect(href).toContain(CATEGORY);
    expect(href).toContain("dateFrom=2026-08-01");
  });

  it("asks back with the household's own options", async () => {
    question.mockResolvedValue({
      message: "“metrobank” could be more than one account. Which one?",
      options: ["Metrobank Payroll", "Metrobank Titanium"],
      status: "clarify",
    });

    await submit("spending on metrobank");

    expect(
      await screen.findByText(
        "“metrobank” could be more than one account. Which one?"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Metrobank Titanium")).toBeInTheDocument();
  });

  it("says so when it cannot answer, and shows no numbers", async () => {
    question.mockResolvedValue({
      message: "I can answer questions about spending.",
      status: "unsupported",
    });

    await submit("should I buy bitcoin");

    expect(
      await screen.findByText("I can answer questions about spending.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps the question when the request fails", async () => {
    question.mockRejectedValue(new Error("network"));

    await submit("net worth");

    await waitFor(() =>
      expect(
        screen.getByText("Couldn’t get an answer. Try again in a moment.")
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText("Question")).toHaveValue("net worth");
    question.mockResolvedValue(spending);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(spending.answer.headline)).toBeVisible();
    expect(question).toHaveBeenLastCalledWith({ question: "net worth" });
  });
});

const proposal = {
  actions: [
    {
      description: "Create the Family trip tag",
      details: '{"name":"Family trip","color":"blue"}',
      id: "action-1",
      tool: "tags.create",
    },
  ],
  expiresAt: "2026-10-02T10:15:00Z",
  message: "Review this tag before saving.",
  requestId: "00000000-0000-4000-8000-000000000007",
  sources: [],
  status: "confirmation",
};

describe("Ask Masdan actions and conversation", () => {
  it("previews exact changes and only writes after explicit confirmation", async () => {
    question.mockResolvedValue(proposal);
    confirm.mockResolvedValue({
      message: "These changes have been saved.",
      outcomes: [
        { result: '{"id":"tag-1","name":"Family trip"}', tool: "tags.create" },
      ],
      requestId: proposal.requestId,
      status: "applied",
    });
    await submit("Create a tag named Family trip");
    expect(
      await screen.findByRole("region", { name: "Proposed changes" })
    ).toBeVisible();
    expect(screen.getByText(/Create the Family trip tag/u)).toBeVisible();
    expect(
      screen.getByText('{"name":"Family trip","color":"blue"}')
    ).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Confirm changes" }));
    expect(
      await screen.findByText("These changes have been saved.")
    ).toBeVisible();
    expect(confirm).toHaveBeenCalledWith({ requestId: proposal.requestId });
    expect(
      screen.queryByRole("button", { name: "Confirm changes" })
    ).toBeNull();
  });

  it("cancels a proposal without performing its writes", async () => {
    question.mockResolvedValue(proposal);
    cancel.mockResolvedValue({
      requestId: proposal.requestId,
      status: "cancelled",
    });
    await submit("Create a tag named Family trip");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Cancel proposal" }));
    expect(
      await screen.findByText("Proposal cancelled. Nothing was changed.")
    ).toBeVisible();
    expect(cancel).toHaveBeenCalledWith({ requestId: proposal.requestId });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("disables the form and confirmation buttons while saving", async () => {
    const pending = Promise.withResolvers<unknown>();
    question.mockResolvedValue(proposal);
    confirm.mockReturnValue(pending.promise);
    await submit("Create a tag named Family trip");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Confirm changes" }));
    expect(screen.getByLabelText("Question")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Confirm changes/u })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Cancel proposal" })
    ).toBeDisabled();
    pending.resolve({
      message: "Saved",
      outcomes: [],
      requestId: proposal.requestId,
      status: "applied",
    });
    expect(await screen.findByText("Saved")).toBeVisible();
  });

  it("keeps a failed confirmation available for a safe retry", async () => {
    question.mockResolvedValue(proposal);
    confirm.mockRejectedValueOnce(new Error("network"));
    await submit("Create a tag named Family trip");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Confirm changes" }));
    expect(await screen.findByText(/retry this confirmation/u)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm changes" })
    ).toBeEnabled();
    confirm.mockResolvedValue({
      message: "Saved once",
      outcomes: [],
      requestId: proposal.requestId,
      status: "applied",
    });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Confirm changes" }));
    expect(await screen.findByText("Saved once")).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("sends follow-ups with a server conversation id and keeps earlier answers", async () => {
    question.mockResolvedValueOnce(spending).mockResolvedValueOnce({
      message: "Your history includes earlier transactions.",
      requestId: proposal.requestId,
      sources: [
        { input: "{}", result: '{"total":6}', tool: "transactions.list" },
      ],
      status: "response",
    });
    await submit("Spending last month");
    const user = userEvent.setup();
    const input = await screen.findByLabelText("Question");
    await screen.findByText(spending.answer.headline);
    await user.clear(input);
    await user.type(input, "What about our entire history?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(
      await screen.findByText("Your history includes earlier transactions.")
    ).toBeVisible();
    expect(screen.getByText(spending.answer.headline)).toBeVisible();
    expect(question).toHaveBeenLastCalledWith({
      previousId: spending.requestId,
      question: "What about our entire history?",
    });
    await user.click(screen.getByText("Verified sources"));
    expect(screen.getByText("transactions.list")).toBeVisible();
  });

  it("keeps the assistant mounted across navigation while a response is pending", async () => {
    const pending = Promise.withResolvers<unknown>();
    question.mockReturnValue(pending.promise);
    renderNavigableShell();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ask Masdan" }));
    await user.type(screen.getByLabelText("Question"), "Show our full history");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(screen.getByRole("link", { name: "Go to accounts" }));
    expect(await screen.findByText("Accounts workspace")).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Ask Masdan" })
    ).toBeVisible();
    expect(screen.getByLabelText("Question")).toHaveValue(
      "Show our full history"
    );
    pending.resolve(spending);
    expect(await screen.findByText(spending.answer.headline)).toBeVisible();
    expect(question).toHaveBeenCalledTimes(1);
  });

  it("refreshes household caches after confirmed changes", async () => {
    question.mockResolvedValue(proposal);
    confirm.mockResolvedValue({
      message: "Saved",
      outcomes: [],
      requestId: proposal.requestId,
      status: "applied",
    });
    const queryClient = renderNavigableShell();
    const refresh = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ask Masdan" }));
    await user.type(
      screen.getByLabelText("Question"),
      "Create a tag named Family trip"
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(
      await screen.findByRole("button", { name: "Confirm changes" })
    );
    await screen.findByText("Saved");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const keys = refresh.mock.calls.map(([filter]) =>
      JSON.stringify(filter?.queryKey)
    );
    expect(
      keys.some((key) => key.includes("household-1") && key.includes("tags"))
    ).toBe(true);
    expect(
      keys.some(
        (key) => key.includes("household-1") && key.includes("transactions")
      )
    ).toBe(true);
  });

  it("stays non-modal and preserves a response that finishes while the sidebar is closed", async () => {
    const pending = Promise.withResolvers<unknown>();
    question.mockReturnValue(pending.promise);
    await submit("Which bills are due?");
    expect(screen.queryByRole("dialog")).toBeNull();
    const user = userEvent.setup();
    const navigation = screen.getByRole("button", {
      name: "Navigate elsewhere",
    });
    expect(navigation).toBeEnabled();
    await user.click(navigation);
    expect(navigation).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close Ask Masdan" }));
    expect(
      screen.queryByRole("complementary", { name: "Ask Masdan" })
    ).toBeNull();
    pending.resolve({
      message: "Your bills are ready to review.",
      requestId: proposal.requestId,
      sources: [],
      status: "response",
    });
    await user.click(screen.getByRole("button", { name: "Ask Masdan" }));
    expect(
      await screen.findByText("Your bills are ready to review.")
    ).toBeVisible();
    expect(screen.getByLabelText("Question")).toHaveValue(
      "Which bills are due?"
    );
    expect(question).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close Ask Masdan" }));
    expect(
      screen.queryByRole("complementary", { name: "Ask Masdan" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Ask Masdan" })).toHaveFocus();
  });

  it("does not display financial conversations while privacy mode is enabled", async () => {
    document.documentElement.dataset.privacy = "on";
    const user = userEvent.setup();
    renderWithProviders(<AskMasdan />);
    await user.click(await screen.findByRole("button", { name: "Ask Masdan" }));
    expect(await screen.findByText(/Turn privacy mode off/u)).toBeVisible();
    expect(screen.queryByLabelText("Question")).toBeNull();
    delete document.documentElement.dataset.privacy;
  });
});
