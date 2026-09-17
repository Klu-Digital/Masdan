import { describe, expect, it } from "vite-plus/test";

import { jobNames, jobs } from "./jobs";

describe("job registry", () => {
  // A cron payload is written once at registration and only validated when the
  // cron fires, so a typo surfaces minutes after deploy on an unwatched queue.
  it("declares cron payloads that satisfy their own job's schema", () => {
    for (const name of jobNames) {
      const definition = jobs[name];
      if (!definition.cron) {
        continue;
      }

      const result = definition.schema.safeParse(definition.cron.data);
      expect(
        result.success,
        `${name} cron data does not match its schema`
      ).toBe(true);
    }
  });

  it("names every queue with a dot-separated prefix", () => {
    // Queue names end up in metric labels and log lines, where the prefix is
    // what makes `example.*` filterable.
    for (const name of jobNames) {
      expect(name).toMatch(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/u);
    }
  });
});
