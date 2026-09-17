"use client";

import { Form as FormPrimitive } from "@base-ui/react/form";
import type React from "react";

export const Form = ({
  className,
  ...props
}: FormPrimitive.Props): React.ReactElement => (
  <FormPrimitive className={className} data-slot="form" {...props} />
);
export { Form as FormPrimitive } from "@base-ui/react/form";
