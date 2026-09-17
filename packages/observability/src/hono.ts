import { evlog } from "evlog/hono";

import { observability } from "./index";

export const honoLogger: typeof evlog = () =>
  evlog({ drain: observability.drain });

export { useLogger } from "evlog/hono";
export type { EvlogVariables } from "evlog/hono";
