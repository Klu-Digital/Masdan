import "vitest";

// Vitest 5's browser matchers shadow jest-dom's RegExp overload; restore it.
declare module "vitest" {
  interface Assertion<R, T> {
    toHaveTextContent: (
      text: string | number | RegExp,
      options?: { normalizeWhitespace: boolean }
    ) => R;
  }
}
