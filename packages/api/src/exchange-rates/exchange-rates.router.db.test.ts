import { member } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { exchangeRatesRouter } from "./exchange-rates.router";

const household = async () => {
  const user = await signUpTestUser();
  const session = await getSessionFor(user.headers);
  return {
    context: {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session,
    } as unknown as Context,
  };
};
const input = {
  fromCurrency: "USD",
  rate: "50",
  rateDate: "2026-01-01",
  toCurrency: "PHP",
};

it("upserts and lists only household rates, then removes its own", async () => {
  const owner = await household();
  const other = await household();
  const first = await call(exchangeRatesRouter.set, input, owner);
  if (!first) {
    throw new Error("Missing rate");
  }
  await call(exchangeRatesRouter.set, { ...input, rate: "51" }, owner);
  expect(await call(exchangeRatesRouter.list, undefined, owner)).toMatchObject([
    { id: first?.id, rate: "51.000000000000" },
  ]);
  await expect(
    call(exchangeRatesRouter.remove, { id: first.id }, other)
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await call(exchangeRatesRouter.list, undefined, other)).toEqual([]);
  await call(exchangeRatesRouter.remove, { id: first.id }, owner);
  expect(await call(exchangeRatesRouter.list, undefined, owner)).toEqual([]);
});

it("allows read-only members to list but not set rates", async () => {
  const owner = await household();
  const { session } = owner.context;
  if (!session?.session.activeOrganizationId) {
    throw new Error("Missing household");
  }
  await getTestDb()
    .update(member)
    .set({ role: "viewer" })
    .where(
      and(
        eq(member.organizationId, session.session.activeOrganizationId),
        eq(member.userId, session.user.id)
      )
    );
  await expect(
    call(exchangeRatesRouter.list, undefined, owner)
  ).resolves.toEqual([]);
  await expect(
    call(exchangeRatesRouter.set, input, owner)
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("rejects identical currencies, nonpositive rates, future dates and disabled codes", async () => {
  const owner = await household();
  await expect(
    call(
      exchangeRatesRouter.set,
      { ...input, rate: "1234567890123456789" },
      owner
    )
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    call(exchangeRatesRouter.set, { ...input, toCurrency: "EUR" }, owner)
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "One side must be the household default currency",
  });
  for (const invalid of [
    { ...input, toCurrency: "USD" },
    { ...input, rate: "0" },
    { ...input, rate: "-1" },
    { ...input, rate: "1.1234567890123" },
    { ...input, rateDate: "2099-01-01" },
    { ...input, fromCurrency: "XYZ" },
  ]) {
    await expect(
      call(exchangeRatesRouter.set, invalid, owner)
    ).rejects.toBeInstanceOf(ORPCError);
  }
});
