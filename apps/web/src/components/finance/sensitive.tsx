"use client";

import type React from "react";

import {
  PRIVACY_MASK,
  usePrivacyMode,
} from "@/components/finance/privacy-mode";

/**
 * A figure written as plain text that privacy mode should mask. `<Amount>`
 * masks itself; reach for this only where a figure is formatted by hand.
 */
export const Sensitive = ({
  children,
  ...props
}: React.ComponentProps<"span">): React.ReactElement => {
  const [privacyOn] = usePrivacyMode();
  return (
    <span data-slot="sensitive" {...props}>
      {privacyOn ? (
        <>
          <span className="sr-only">Amount hidden</span>
          <span aria-hidden="true">{PRIVACY_MASK}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
};
