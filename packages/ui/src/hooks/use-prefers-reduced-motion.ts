import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const noopUnsubscribe = (): void => {
  // Nothing was subscribed, so there is nothing to tear down.
};

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return noopUnsubscribe;
  }
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const snapshot = (): boolean =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.(QUERY).matches);

export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, snapshot, () => false);
