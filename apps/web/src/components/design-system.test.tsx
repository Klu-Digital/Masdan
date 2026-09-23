import { ColumnChart } from "@masdan/ui/charts/column-chart";
import { Amount } from "@masdan/ui/components/amount";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";

describe("Amount", () => {
  it("speaks the sign in words and keeps the typographic minus visual-only", () => {
    render(<Amount currency="USD" sign="out" value="20" />);
    expect(screen.getByText("minus $20.00")).toBeInTheDocument();
  });

  it("colours incoming money only when asked to", () => {
    const { container } = render(
      <Amount currency="USD" sign="in" tone="auto" value="5" />
    );
    expect(container.firstElementChild).toHaveClass("text-positive-foreground");
  });
});

describe("ColumnChart", () => {
  const data = ["Jul", "Aug", "Sep"].map((label, index) => ({
    key: label,
    label,
    longLabel: `${label} 2026`,
    values: { expense: (index + 1) * 100, income: (index + 1) * 1000 },
  }));

  const renderChart = () =>
    render(
      <ColumnChart
        data={data}
        formatAxis={String}
        formatValue={(value) => `#${value}`}
        series={[
          {
            fillClassName: "fill-chart-2",
            key: "income",
            label: "Money in",
            swatchClassName: "bg-chart-2",
          },
          {
            fillClassName: "fill-chart-1",
            key: "expense",
            label: "Money out",
            swatchClassName: "bg-chart-1",
          },
        ]}
        title="Cash flow"
      />
    );

  it("reads out the latest period by default and lists every value in a table", () => {
    renderChart();
    expect(screen.getAllByText("Sep 2026").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("table", { name: "Cash flow" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("#1000").length).toBeGreaterThan(0);
  });

  it("moves between periods with the arrow keys", async () => {
    const user = userEvent.setup();
    renderChart();
    screen.getByRole("button", { name: "Sep 2026" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "Aug 2026" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Aug 2026" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "Jul 2026" })).toHaveFocus();
  });
});
