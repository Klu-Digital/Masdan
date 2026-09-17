"use client";

import * as React from "react";

export const useCopyToClipboard = ({
  timeout = 2000,
  onCopy,
}: {
  timeout?: number;
  onCopy?: () => void;
} = {}): { copyToClipboard: (value: string) => void; isCopied: boolean } => {
  const [isCopied, setIsCopied] = React.useState(false);
  const timeoutIdRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyToClipboard = async (value: string): Promise<void> => {
    if (typeof window === "undefined" || !navigator.clipboard.writeText) {
      return;
    }

    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error(error);
      return;
    }

    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }
    setIsCopied(true);

    if (onCopy) {
      onCopy();
    }

    if (timeout !== 0) {
      timeoutIdRef.current = setTimeout(() => {
        setIsCopied(false);
        timeoutIdRef.current = null;
      }, timeout);
    }
  };

  // Cleanup timeout on unmount
  React.useEffect(
    () => (): void => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    },
    []
  );

  return { copyToClipboard, isCopied };
};
