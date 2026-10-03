import { cn } from "@masdan/ui/lib/utils";

export const BrandMark = ({ className }: { className?: string }) => (
  <>
    <img
      alt=""
      className={cn("size-10 dark:hidden", className)}
      src="/favicon-light.png"
    />
    <img
      alt=""
      className={cn("hidden size-10 dark:block", className)}
      src="/favicon-dark.png"
    />
  </>
);
