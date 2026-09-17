import { queue } from "@masdan/queue";
import { z } from "zod";

import { orgMutationProcedure } from "../procedures";

/**
 * Demonstrates the transactional enqueue path. Delete with the `example.*`
 * registry entries.
 */
export const jobsRouter = {
  enqueueExample: orgMutationProcedure
    .input(z.object({ message: z.string().min(1).max(512) }))
    .handler(async ({ context, input }) => {
      // `context.db` is the transaction `orgMutationProcedure` opened, so a
      // later throw rolls the job back too.
      const jobId = await queue.enqueue("example.echo", input, {
        tx: context.db,
      });

      return { jobId };
    }),
};
