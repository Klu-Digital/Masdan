const NOT_A_PROCEDURE = new Set<PropertyKey>(["then", "catch", "finally"]);

const node = (value: unknown): unknown =>
  new Proxy(
    (input: unknown) =>
      typeof value === "function" ? value(input) : undefined,
    {
      get: (_target, key) =>
        NOT_A_PROCEDURE.has(key)
          ? undefined
          : node((value as Record<PropertyKey, unknown> | undefined)?.[key]),
    }
  );

/**
 * The transport for `vi.mock("@/utils/client")`. Procedures get only their
 * input, which is what tests assert on — oRPC's query utils also pass a signal
 * and context. Unmocked procedures resolve `undefined`, so `householdOrpc`
 * still finds every router.
 */
export const mockClient = (procedures: object): unknown => node(procedures);
