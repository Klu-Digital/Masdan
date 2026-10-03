import type { AppRouterClient } from "@masdan/api/routers/index";
import type { Client } from "@orpc/client";

type Handlers<T> = {
  [K in keyof T]?: T[K] extends Client<
    infer _Context,
    infer I,
    infer O,
    infer _Error
  >
    ? (input: I) => O | Promise<O>
    : Handlers<T[K]>;
};

/** Every procedure the demo answers; the rest say they need the server. */
export type DemoRouter = Handlers<AppRouterClient>;

export type Section<K extends keyof AppRouterClient> = Handlers<
  AppRouterClient[K]
>;
