import { getConnInfo } from "@hono/node-server/conninfo";
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
import type {
  Context as HonoRequestContext,
  Hono,
  MiddlewareHandler,
} from "hono";

const logOrpcError = (error: unknown) => {
  const { message, code, status } = parseError(error);
  log.error({ action: "orpc.error", code, message, status });
};

/**
 * `getConnInfo` throws when there is no Node socket, as in `app.request(...)`
 * from tests.
 */
const remoteAddressOf = (
  c: HonoRequestContext<EvlogVariables>
): string | undefined => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
};

const apiHandler = new OpenAPIHandler(appRouter, {
  interceptors: [onError(logOrpcError)],
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
});

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
      // The socket address is only reachable from `@hono/node-server`, which
      // `@masdan/api` deliberately does not depend on — so resolve it here, once.
      context: await createContext({
        context: c,
        remoteAddress: remoteAddressOf(c),
      }),
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

export const mountOrpc = (app: Hono<EvlogVariables>) => {
  mount(app, "/rpc", rpcHandler);
  mount(app, "/api-reference", apiHandler);
};
