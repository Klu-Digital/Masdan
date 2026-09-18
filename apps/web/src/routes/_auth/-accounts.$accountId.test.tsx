import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { routeTree } from "@/routeTree.gen";

describe("account detail routing", () => {
  it("matches a direct account URL to the detail route", () => {
    const accountId = "00000000-0000-0000-0000-000000000001";
    const router = createRouter({
      context: {} as never,
      routeTree,
    });

    const matches = router.matchRoutes(`/accounts/${accountId}`);
    const detailMatch = matches.at(-1);

    expect(detailMatch?.routeId).toBe("/_auth/accounts/$accountId");
    expect(detailMatch?.params).toMatchObject({ accountId });
  });
});
