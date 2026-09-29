import { call, ORPCError } from "@orpc/server";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { o } from "../procedures";
import { notFound } from "./errors";

const context = {} as Context;

const caught = async (
  p: Promise<unknown>
): Promise<ORPCError<string, unknown>> => {
  try {
    await p;
  } catch (error) {
    if (error instanceof ORPCError) {
      return error;
    }
  }
  throw new Error("expected an ORPCError");
};

const throwing = (error: Error) =>
  o.handler(() => {
    throw error;
  });

describe("domain errors", () => {
  it("answers a thrown domain error as defined, so the web shows its message", async () => {
    const error = await caught(
      call(
        throwing(new ORPCError("CONFLICT", { message: "Name taken" })),
        undefined,
        { context }
      )
    );
    expect(error).toMatchObject({ code: "CONFLICT", defined: true });
  });

  it("covers `notFound`", async () => {
    const error = await caught(
      call(throwing(notFound("Transaction")), undefined, { context })
    );
    expect(error).toMatchObject({ code: "NOT_FOUND", defined: true });
  });

  it("leaves an internal error undefined, so its message never reaches people", async () => {
    const error = await caught(
      call(
        throwing(
          new ORPCError("INTERNAL_SERVER_ERROR", { message: "SQL detail" })
        ),
        undefined,
        { context }
      )
    );
    expect(error.defined).toBe(false);
  });

  it("types the rate limit's retry hint, and drops a malformed one", async () => {
    const valid = await caught(
      call(
        throwing(
          new ORPCError("TOO_MANY_REQUESTS", { data: { retryAfter: 60 } })
        ),
        undefined,
        { context }
      )
    );
    const malformed = await caught(
      call(throwing(new ORPCError("TOO_MANY_REQUESTS")), undefined, {
        context,
      })
    );
    expect(valid).toMatchObject({ data: { retryAfter: 60 }, defined: true });
    expect(malformed.defined).toBe(false);
  });
});
