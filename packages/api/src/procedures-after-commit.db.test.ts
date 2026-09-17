import { file } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "./context";
import { orgMutationProcedure } from "./procedures";

/**
 * The queued task reads the row back on a different pool connection from the
 * handler's transaction, so it sees the row only once that transaction
 * committed.
 */

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

/**
 * Writes one row, then queues a task reporting whether it was visible from
 * outside the transaction.
 */
const writeThenQueue = (
  report: (seenFromOutside: boolean) => void,
  afterQueueing?: () => void
) =>
  orgMutationProcedure.handler(async ({ context }) => {
    const key = `org/${context.organizationId}/${crypto.randomUUID()}/photo.png`;

    await context.db.insert(file).values({
      bucket: "test-bucket",
      contentType: "image/png",
      key,
      name: "photo.png",
      organizationId: context.organizationId,
      userId: context.session.user.id,
    });

    context.afterCommit(async () => {
      const rows = await getTestDb()
        .select()
        .from(file)
        .where(eq(file.key, key));
      report(rows.length === 1);
    });

    afterQueueing?.();
    return { key };
  });

describe("afterCommit", () => {
  it("runs queued work, and only once the transaction has committed", async () => {
    const seen: boolean[] = [];
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    await call(
      writeThenQueue((seenFromOutside) => seen.push(seenFromOutside)),
      undefined,
      { context }
    );

    // Ran at all — the middleware used to drop the callback on the floor.
    expect(seen).toHaveLength(1);
    // ...and ran late enough that the row had committed.
    expect(seen[0]).toBe(true);
  });

  it("does not run queued work when the transaction rolls back", async () => {
    const seen: boolean[] = [];
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    await expect(
      call(
        writeThenQueue(
          (seenFromOutside) => seen.push(seenFromOutside),
          () => {
            throw new Error("boom");
          }
        ),
        undefined,
        { context }
      )
    ).rejects.toThrow("boom");

    expect(seen).toEqual([]);
    expect(await getTestDb().select().from(file)).toHaveLength(0);
  });

  it("does not fail the mutation when a queued task throws", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const procedure = orgMutationProcedure.handler(({ context: ctx }) => {
      ctx.afterCommit(() => Promise.reject(new Error("invalidation failed")));
      return { ok: true };
    });

    await expect(call(procedure, undefined, { context })).resolves.toEqual({
      ok: true,
    });
  });
});
