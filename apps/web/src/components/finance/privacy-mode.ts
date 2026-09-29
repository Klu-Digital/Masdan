"use client";

import { useSyncExternalStore } from "react";

/** What a masked figure shows in place of its digits. */
export const PRIVACY_MASK = "****";

const STORAGE_KEY = "masdan.privacy";
const listeners = new Set<() => void>();

export const readPrivacyMode = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return document.documentElement.dataset.privacy === "on";
  }
};

const apply = (on: boolean): void => {
  if (on) {
    document.documentElement.dataset.privacy = "on";
  } else {
    delete document.documentElement.dataset.privacy;
  }
  for (const listener of listeners) {
    listener();
  }
};

export const setPrivacyMode = (on: boolean): void => {
  try {
    if (on) {
      window.localStorage.setItem(STORAGE_KEY, "on");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage may be blocked; keep this page's choice visible.
  }
  apply(on);
};

export const applyStoredPrivacyMode = (): void => {
  apply(readPrivacyMode());
};

const onStorage = (event: StorageEvent): void => {
  if (event.key === STORAGE_KEY || event.key === null) {
    applyStoredPrivacyMode();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
    }
  };
};

const snapshot = (): boolean =>
  document.documentElement.dataset.privacy === "on";

export const usePrivacyMode = (): [boolean, (on: boolean) => void] => [
  useSyncExternalStore(subscribe, snapshot, () => false),
  setPrivacyMode,
];
