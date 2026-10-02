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

// Unmocked procedures resolve `undefined`, so `householdOrpc` finds every router.
export const mockClient = (procedures: object): unknown => node(procedures);
