import { cn } from "@masdan/ui/lib/utils";

export const BrandMark = ({ className }: { className?: string }) => (
  <img alt="" className={cn("size-10", className)} src="/logo.png" />
);
