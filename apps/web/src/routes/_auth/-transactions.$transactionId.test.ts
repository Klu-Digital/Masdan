import { describe, expect, it } from "vite-plus/test";

import { Route } from "./transactions.$transactionId";

describe("transaction detail route", () => {
  it("does not block opening the inspector on its detail request", () => {
    expect(Route.options.loader).toBeUndefined();
  });
});
