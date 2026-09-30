import { BankIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

// Bundled at build time, never hotlinked: see assets/institutions/README.md.
const LOGOS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../assets/institutions/*.{png,svg,webp}", {
      eager: true,
      import: "default",
      query: "?url",
    })
  ).map(([file, url]) => [
    file.slice(file.lastIndexOf("/") + 1, file.lastIndexOf(".")),
    url,
  ])
);

// One radius per size, matching IconTile, so a logo and a glyph line up.
const SIZES = {
  default: "size-9 rounded-[10px] text-xs",
  lg: "size-12 rounded-[14px] text-sm",
  sm: "size-7 rounded-lg text-[10px]",
  xl: "size-16 rounded-[18px] text-base",
  xs: "size-5 rounded-md text-[8px]",
} as const;

export type InstitutionLogoSize = keyof typeof SIZES;

const HEX_PAIRS = /[0-9a-f]{2}/giu;
const UPPERCASE = /\p{Lu}/gu;

const isPale = (hex: string): boolean => {
  const [r = 0, g = 0, b = 0] = (hex.slice(1).match(HEX_PAIRS) ?? []).map(
    (pair) => Number.parseInt(pair, 16) / 255
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
};

/** "MariBank" → "MB", "BPI" → "BPI", "Netbank" → "N". */
const institutionInitials = (shortName: string): string => {
  const capitals = shortName.match(UPPERCASE) ?? [];
  return (capitals.length > 0 ? capitals.join("") : shortName.charAt(0))
    .slice(0, 4)
    .toUpperCase();
};

export interface LogoInstitution {
  brandColor: string;
  logoKey: string;
  shortName: string;
}

const Mark = ({
  institution,
  logo,
}: {
  institution: LogoInstitution | null;
  logo: string | undefined;
}) => {
  if (institution && logo) {
    return (
      <img
        alt=""
        className="size-full object-cover"
        decoding="async"
        draggable={false}
        src={logo}
      />
    );
  }
  if (institution) {
    return (
      <span className="font-semibold tracking-tight">
        {institutionInitials(institution.shortName)}
      </span>
    );
  }
  return (
    <HugeiconsIcon className="size-1/2" icon={BankIcon} strokeWidth={1.8} />
  );
};

const toneOf = (institution: LogoInstitution | null, logo?: string) => {
  if (!institution) {
    return "bg-secondary text-muted-foreground";
  }
  if (logo) {
    return "bg-card";
  }
  return isPale(institution.brandColor)
    ? "bg-(--institution-brand) text-on-pale-tint"
    : "bg-(--institution-brand) text-on-tint";
};

/**
 * A bank's mark in one shared frame: its logo when one is bundled, its
 * initials on its brand colour otherwise, a plain bank glyph for one Masdan
 * doesn't know. The inset hairline and sheen are what let a white logo, a
 * black one and a saturated one sit side by side.
 */
export const InstitutionLogo = ({
  channel,
  className,
  institution,
  size = "default",
}: {
  /** The app it is opened through, shown as a corner badge: UNO × GCash. */
  channel?: LogoInstitution | null;
  className?: string;
  institution: LogoInstitution | null;
  size?: InstitutionLogoSize;
}): React.ReactElement => {
  const logo = institution ? LOGOS[institution.logoKey] : undefined;
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0", className)}
      data-slot="institution-logo"
    >
      <span
        className={cn(
          "relative isolate inline-flex items-center justify-center overflow-hidden leading-none select-none",
          SIZES[size],
          toneOf(institution, logo)
        )}
        style={
          institution
            ? ({
                "--institution-brand": institution.brandColor,
              } as React.CSSProperties)
            : undefined
        }
      >
        <Mark institution={institution} logo={logo} />
        {institution ? (
          <span className="from-sheen pointer-events-none absolute inset-0 bg-linear-to-b to-transparent to-45% opacity-25" />
        ) : null}
        <span className="ring-foreground/10 pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset" />
      </span>
      {channel ? (
        <span className="ring-background absolute -right-1 -bottom-1 rounded-md ring-2">
          <InstitutionLogo institution={channel} size="xs" />
        </span>
      ) : null}
    </span>
  );
};
