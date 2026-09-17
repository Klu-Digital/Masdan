import { toastManager } from "@k22i/ui/components/toast";
import { describe, expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@/utils/orpc";

vi.mock("@k22i/ui/components/toast", () => ({
  toastManager: {
    add: vi.fn(),
    close: vi.fn(),
    update: vi.fn(),
  },
}));

describe("createQueryClient", () => {
  it("fires an error toast with a retry action when a query fails", async () => {
    const queryClient = createQueryClient();

    await queryClient
      .fetchQuery({
        queryFn: () => Promise.reject(new Error("boom")),
        queryKey: ["x"],
        retry: false,
      })
      .catch(() => {
        // expected: the query is set up to reject.
      });

    expect(toastManager.add).toHaveBeenCalledTimes(1);
    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({
        actionProps: expect.objectContaining({
          children: "retry",
          onClick: expect.any(Function),
        }),
        title: "Error: boom",
        type: "error",
      })
    );
  });
});
