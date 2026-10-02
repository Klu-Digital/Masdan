import { createContext } from "@masdan/api/context";
import type { Context } from "@masdan/api/context";
import { appRouter } from "@masdan/api/routers/index";
import { log, parseError } from "@masdan/observability";
import type { EvlogVariables } from "@masdan/observability/hono";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { clientIpOf } from "./client-ip";

/** Every RPC input is small: file contents go straight to the bucket. */
const RPC_MAX_BODY_BYTES = 1024 * 1024;

const logOrpcError = (error: unknown) => {
  const { message, code, status } = parseError(error);
  log.error({ action: "orpc.error", code, message, status });
};

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [onError(logOrpcError)],
});

interface OrpcHandler {
  handle: (
    request: Request,
    options: { prefix: `/${string}`; context: Context }
  ) => Promise<{ matched: boolean; response?: Response }>;
}

const mount = (
  app: Hono<EvlogVariables>,
  prefix: `/${string}`,
  handler: OrpcHandler
) => {
  const middleware: MiddlewareHandler<EvlogVariables> = async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      context: await createContext({ context: c, ip: clientIpOf(c) }),
      prefix,
    });

    if (matched && response) {
      return c.newResponse(response.body, response);
    }

    return next();
  };

  app.use(prefix, middleware);
  app.use(`${prefix}/*`, middleware);
};

const rpcBodyLimit = bodyLimit({
  maxSize: RPC_MAX_BODY_BYTES,
  onError: (c) => c.json({ message: "Request body too large" }, 413),
});

export const mountOrpc = (
  app: Hono<EvlogVariables>,
  options: { apiReference: boolean }
) => {
  app.use("/rpc", rpcBodyLimit);
  app.use("/rpc/*", rpcBodyLimit);
  mount(app, "/rpc", rpcHandler);

  // A full REST surface over every procedure, so production does not get one.
  if (options.apiReference) {
    mount(
      app,
      "/api-reference",
      new OpenAPIHandler(appRouter, {
        interceptors: [onError(logOrpcError)],
        plugins: [
          new OpenAPIReferencePlugin({
            schemaConverters: [new ZodToJsonSchemaConverter()],
          }),
        ],
      })
    );
  }
};
