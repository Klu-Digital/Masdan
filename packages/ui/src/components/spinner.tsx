import { LoaderCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@masdan/ui/lib/utils";
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
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    role="status"
    strokeWidth={2}
    {...props}
  />
);
