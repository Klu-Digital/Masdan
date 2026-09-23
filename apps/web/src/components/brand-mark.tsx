import { cn } from "@masdan/ui/lib/utils";

/**
 * The Masdan mark: two rising bars inside a rounded square — money that
 * grows, drawn with the restraint of the rest of the product.
 */
export const BrandMark = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={cn("size-10", className)}
    fill="none"
    viewBox="0 0 40 40"
  >
    <rect className="fill-primary" height="40" rx="11" width="40" />
    <rect
      className="fill-primary-foreground"
      height="12"
      opacity="0.55"
      rx="2.5"
      width="5"
      x="11"
      y="17"
    />
    <rect
      className="fill-primary-foreground"
      height="18"
      opacity="0.8"
      rx="2.5"
      width="5"
      x="17.5"
      y="11"
    />
    <rect className="fill-brand" height="8" rx="2.5" width="5" x="24" y="21" />
  </svg>
);
