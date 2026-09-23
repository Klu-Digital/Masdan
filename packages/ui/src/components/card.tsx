"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

/**
 * A grouped surface. Separation comes from a luminance step, not an outline:
 * light mode is a soft fill, dark mode adds a hairline because fills alone
 * disappear against a dark canvas.
 */
export const Card = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "bg-card text-card-foreground dark:ring-hairline relative flex flex-col rounded-2xl dark:ring-1",
      className
    ),
    "data-slot": "card",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const CardHeader = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 px-5 pt-4.5 pb-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
      className
    ),
    "data-slot": "card-header",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const CardTitle = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn("text-base font-semibold", className),
    "data-slot": "card-title",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const CardDescription = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn("text-muted-foreground text-sm", className),
    "data-slot": "card-description",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const CardAction = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "col-start-2 row-span-2 row-start-1 inline-flex self-start justify-self-end",
      className
    ),
    "data-slot": "card-action",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const CardPanel = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "flex-1 px-5 pb-5 not-in-[[data-slot=card]:has(>[data-slot=card-header])]:pt-5",
      className
    ),
    "data-slot": "card-panel",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const CardFooter = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "border-hairline flex items-center gap-2 border-t px-5 py-3.5",
      className
    ),
    "data-slot": "card-footer",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export { CardPanel as CardContent };
