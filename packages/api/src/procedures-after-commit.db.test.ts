import { file } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "./context";
import { orgMutationProcedure } from "./procedures";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

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

  it.each([false, true])(
    "holds nested callbacks until the outer transaction finishes (rollback: %s)",
    async (rollback) => {
      const seen: boolean[] = [];
      const { headers } = await signUpTestUser();
      const context = await contextFor(headers);
      let ranInside = false;
      const outer = orgMutationProcedure.handler(
        async ({ context: nestedContext }) => {
          await call(
            writeThenQueue((visible) => seen.push(visible)),
            undefined,
            { context: nestedContext }
          );
          ranInside = seen.length > 0;
          if (rollback) {
            throw new Error("outer rollback");
          }
        }
      );
      const mutation = call(outer, undefined, { context });
      await (rollback
        ? expect(mutation).rejects.toThrow("outer rollback")
        : mutation);
      expect(ranInside).toBe(false);
      expect(seen).toEqual(rollback ? [] : [true]);
      expect(await getTestDb().select().from(file)).toHaveLength(
        rollback ? 0 : 1
      );
    }
  );

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
