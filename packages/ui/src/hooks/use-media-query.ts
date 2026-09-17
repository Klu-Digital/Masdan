"use client";

import { useCallback, useSyncExternalStore } from "react";

// SSR has no `window` to subscribe to, so `subscribe` below has nothing to
// tear down.
const noopUnsubscribe = (): void => {
  // intentionally empty
};

const BREAKPOINTS = {
  "2xl": 1536,
  "3xl": 1600,
  "4xl": 2000,
  lg: 1024,
  md: 800,
  sm: 640,
  xl: 1280,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

type BreakpointQuery =
  | Breakpoint
  | `max-${Breakpoint}`
  | `${Breakpoint}:max-${Breakpoint}`;

const resolveMin = (value: Breakpoint | number): string => {
  const px = typeof value === "number" ? value : BREAKPOINTS[value];
  return `(min-width: ${px}px)`;
};

const resolveMax = (value: Breakpoint | number): string => {
  const px = typeof value === "number" ? value : BREAKPOINTS[value];
  return `(max-width: ${px - 1}px)`;
};

// Widened via `& {}` — the "loose autocomplete" trick — so a bare `string` does
// not swallow the `BreakpointQuery` literal union.
// oxlint-disable-next-line typescript/ban-types
type LooseString = string & {};

const parseQuery = (
  query: BreakpointQuery | MediaQueryInput | LooseString
): string => {
  if (typeof query !== "string") {
    const parts: string[] = [];
    if (query.min !== undefined) {
      parts.push(resolveMin(query.min));
    }
    if (query.max !== undefined) {
      parts.push(resolveMax(query.max));
    }
    if (query.pointer === "coarse") {
      parts.push("(pointer: coarse)");
    }
    if (query.pointer === "fine") {
      parts.push("(pointer: fine)");
    }
    if (parts.length === 0) {
      return "(min-width: 0px)";
    }
    return parts.join(" and ");
  }

  if (query.startsWith("(")) {
    return query;
  }

  const parts: string[] = [];
  for (const segment of query.split(":")) {
    if (segment.startsWith("max-")) {
      const bp = segment.slice(4);
      if (bp in BREAKPOINTS) {
        parts.push(resolveMax(bp as Breakpoint));
      }
    } else if (segment in BREAKPOINTS) {
      parts.push(resolveMin(segment as Breakpoint));
    }
  }

  return parts.length > 0 ? parts.join(" and ") : query;
};

const getServerSnapshot = (): boolean => false;

export interface MediaQueryInput {
  min?: Breakpoint | number;
  max?: Breakpoint | number;
  /** Touch-like input (finger). Use "fine" for mouse/trackpad. */
  pointer?: "coarse" | "fine";
}

export const useMediaQuery = (
  query: BreakpointQuery | MediaQueryInput | LooseString
): boolean => {
  const mediaQuery = parseQuery(query);

  const subscribe = useCallback(
    // `useSyncExternalStore`'s subscribe contract is callback-based.
    // oxlint-disable-next-line promise/prefer-await-to-callbacks
    (callback: () => void) => {
      if (typeof window === "undefined") {
        return noopUnsubscribe;
      }
      const mql = window.matchMedia(mediaQuery);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [mediaQuery]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(mediaQuery).matches;
  }, [mediaQuery]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};

export const useIsMobile = (): boolean => useMediaQuery("max-md");
