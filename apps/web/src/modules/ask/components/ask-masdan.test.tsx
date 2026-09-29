import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { formatLongDate } from "@/lib/dates";
import { renderWithProviders } from "@/test/render";

const question = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return { client: mockClient({ ask: { question } }) };
});

const { AskMasdan } = await import("./ask-masdan");

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
  status: "answered",
};

const submit = async (text: string) => {
  const user = userEvent.setup();
  renderWithProviders(<AskMasdan />);
  await user.type(await screen.findByLabelText("Question"), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
};

beforeEach(() => {
  question.mockReset();
});

describe("AskMasdan", () => {
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
  });
});
