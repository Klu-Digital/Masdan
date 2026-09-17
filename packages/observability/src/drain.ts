import { env } from "@k22i/env/shared-server";
import type { DrainContext } from "evlog";
import { createFsDrain } from "evlog/fs";
import { createDrainPipeline } from "evlog/pipeline";
import { createPostHogDrain } from "evlog/posthog";

export const createDrain = () => {
  if (env.POSTHOG_PROJECT_API_KEY) {
    const pipeline = createDrainPipeline<DrainContext>({
      batch: { intervalMs: 5000, size: 50 },
      retry: { backoff: "exponential", maxAttempts: 3 },
    });

    const drain = pipeline(
      createPostHogDrain({
        apiKey: env.POSTHOG_PROJECT_API_KEY,
        host: env.POSTHOG_HOST,
        recordShape: "compact",
      })
    );

    return { drain, flush: () => drain.flush() };
  }

  const persistLogs = env.NODE_ENV !== "production" && env.NODE_ENV !== "test";
  const drain = persistLogs ? createFsDrain() : undefined;

  return { drain, flush: () => Promise.resolve() };
};
