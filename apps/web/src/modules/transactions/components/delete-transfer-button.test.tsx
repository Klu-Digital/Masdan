import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { DeleteTransferButton } from "./delete-transfer-button";

it("requires confirmation before permanently deleting both transfer postings", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(
    <DeleteTransferButton
      destination="Credit card"
      onConfirm={onConfirm}
      source="Checking"
    />
  );

  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText(/Checking to Credit card/iu)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onConfirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Delete permanently" }));
  expect(onConfirm).toHaveBeenCalledOnce();
});
