import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { Amount } from "@/components/finance/amount";
import { applyStoredPrivacyMode } from "@/components/finance/privacy-mode";
import { Sensitive } from "@/components/finance/sensitive";

import { PrivacyToggle } from "./privacy-toggle";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
  setItem: (key: string, value: string) => storage.set(key, value),
});

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.privacy;
});

it("toggles and restores the device preference", async () => {
  const user = userEvent.setup();
  render(<PrivacyToggle />);
  const button = screen.getByRole("button", { name: "Hide amounts" });
  expect(button).toHaveAttribute("aria-pressed", "false");

  await user.click(button);
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(button).toHaveAttribute("aria-label", "Show amounts");
  expect(document.documentElement).toHaveAttribute("data-privacy", "on");
  expect(window.localStorage.getItem("masdan.privacy")).toBe("on");

  delete document.documentElement.dataset.privacy;
  applyStoredPrivacyMode();
  expect(document.documentElement).toHaveAttribute("data-privacy", "on");

  await user.click(button);
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(button).toHaveAttribute("aria-label", "Hide amounts");
  expect(document.documentElement).not.toHaveAttribute("data-privacy");
  expect(window.localStorage.getItem("masdan.privacy")).toBeNull();

  act(() => {
    window.localStorage.setItem("masdan.privacy", "on");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "masdan.privacy" })
    );
  });
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement).toHaveAttribute("data-privacy", "on");
});

it("masks an amount with asterisks and hides its spoken value", async () => {
  const user = userEvent.setup();
  render(
    <>
      <PrivacyToggle />
      <Amount currency="PHP" value={1234.5} />
    </>
  );
  const amount = document.querySelector('[data-slot="amount"]');
  expect(amount?.querySelector(".sr-only")).toHaveTextContent("1,234.50");
  expect(amount?.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "1,234.50"
  );

  await user.click(screen.getByRole("button", { name: "Hide amounts" }));
  expect(amount?.querySelector(".sr-only")).toHaveTextContent("Amount hidden");
  expect(amount).not.toHaveTextContent("1,234");
  expect(amount).not.toHaveTextContent(".50");
  expect(amount?.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "****"
  );
});

it("masks hand-formatted figures with asterisks", async () => {
  const user = userEvent.setup();
  render(
    <>
      <PrivacyToggle />
      <p data-testid="figure">
        Plus <Sensitive>₱5.00</Sensitive>
      </p>
    </>
  );
  const figure = screen.getByTestId("figure");
  expect(figure).toHaveTextContent("Plus ₱5.00");
  expect(figure.querySelector('[aria-hidden="true"]')).toBeNull();

  await user.click(screen.getByRole("button", { name: "Hide amounts" }));
  expect(figure).not.toHaveTextContent("₱5.00");
  expect(figure.querySelector(".sr-only")).toHaveTextContent("Amount hidden");
  expect(figure.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "****"
  );
});
