import { refreshExchangeRates } from "@masdan/api/exchange-rates/feed";
import { db } from "@masdan/db";
import { env } from "@masdan/env/workers";
import { log } from "@masdan/observability";
import type { JobOf } from "@masdan/queue";

export const handleFxRefresh = async (
  job: JobOf<"fx.refresh">
): Promise<void> => {
  const result = await refreshExchangeRates(db, { url: env.FX_RATES_URL });
  log.info({ action: "fx.refresh.completed", jobId: job.id, ...result });
};
