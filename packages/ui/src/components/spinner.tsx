import { LoaderCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@k22i/ui/lib/utils";
import type React from "react";

export const Spinner = ({
  className,
  ...props
}: Omit<
  React.ComponentProps<typeof HugeiconsIcon>,
  "icon"
>): React.ReactElement => (
  <HugeiconsIcon
    aria-label="Loading"
    className={cn("animate-spin", className)}
    icon={LoaderCircleIcon}
    // `HugeiconsIcon` renders an `<svg>`, so there is no `<output>` to swap the
    // role for.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    role="status"
    strokeWidth={2}
    {...props}
  />
);
