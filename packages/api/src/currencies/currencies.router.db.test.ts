import { currency } from "@masdan/db/schema/finance";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { currenciesRouter } from "./currencies.router";

/** `pnpm fix` renames a `catch` binding to `error`, which shadows a local of
 * the same name — capture the rejection here instead. */
const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const contextFor = async (headers?: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: headers ? await getSessionFor(headers) : null,
  }) as unknown as Context;

describe("currencies.list", () => {
  it("requires authentication", async () => {
    const error = await caught(
      call(currenciesRouter.list, undefined, {
        context: await contextFor(),
      })
    );

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("UNAUTHORIZED");
  });

  it("serves the seeded reference data with ICU minor units", async () => {
    const { headers } = await signUpTestUser();

    const currencies = await call(currenciesRouter.list, undefined, {
      context: await contextFor(headers),
    });

    // The gist this data is built from has 118 codes and gets six sets of
    // minor units wrong; ICU is the source for both.
    expect(currencies.length).toBeGreaterThan(150);
    expect(currencies.find((row) => row.code === "PHP")).toEqual({
      code: "PHP",
      minorUnits: 2,
      name: "Philippine Peso",
      symbol: "₱",
      symbolNative: "₱",
    });
    expect(currencies.find((row) => row.code === "JPY")?.minorUnits).toBe(0);
    expect(currencies.find((row) => row.code === "KWD")?.minorUnits).toBe(3);
    expect(currencies.find((row) => row.code === "AMD")?.minorUnits).toBe(2);
  });

  it("omits disabled currencies", async () => {
    const { headers } = await signUpTestUser();
    await getTestDb()
      .update(currency)
      .set({ enabled: false })
      .where(eq(currency.code, "ZWL"));

    try {
      const currencies = await call(currenciesRouter.list, undefined, {
        context: await contextFor(headers),
      });

      expect(currencies.some((row) => row.code === "ZWL")).toBe(false);
    } finally {
      // `currency` is held back from the per-test truncation, so put it back.
      await getTestDb()
        .update(currency)
        .set({ enabled: true })
        .where(eq(currency.code, "ZWL"));
    }
  });
});
