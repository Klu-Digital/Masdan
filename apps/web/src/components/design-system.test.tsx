import { Amount } from "@masdan/ui/components/amount";
import { render, screen } from "@testing-library/react";
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
