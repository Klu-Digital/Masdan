"use client";

import { CheckboxGroup as CheckboxGroupPrimitive } from "@base-ui/react/checkbox-group";
import { cn } from "@k22i/ui/lib/utils";
import type React from "react";

export const CheckboxGroup = ({
  className,
  ...props
}: CheckboxGroupPrimitive.Props): React.ReactElement => (
  <CheckboxGroupPrimitive
    className={cn("flex flex-col items-start gap-3", className)}
    {...props}
  />
);
export { CheckboxGroup as CheckboxGroupPrimitive } from "@base-ui/react/checkbox-group";
