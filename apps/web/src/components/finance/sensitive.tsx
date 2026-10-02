"use client";

import type React from "react";

import {
  PRIVACY_MASK,
  usePrivacyMode,
} from "@/components/finance/privacy-mode";

// `<Amount>` masks itself; use this only for hand-formatted figures.
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
