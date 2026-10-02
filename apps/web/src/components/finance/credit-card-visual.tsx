import { paletteOf } from "@masdan/ui/lib/palette";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";
import { useId, useRef } from "react";

import { H, PALETTE_SLOTS, W } from "@/components/finance/card-art/canvas";
import type { CardArt } from "@/components/finance/card-art/canvas";
import {
  CardMotif,
  CardPattern,
  Rings,
} from "@/components/finance/credit-card-art";
import { NetworkMark } from "@/components/finance/network-mark";
import type { NetworkMarkKind } from "@/components/finance/network-mark";

const TILT_DEGREES = 4;
const SHELL = {
  compact: "rounded-xl shadow-xs",
  full: "rounded-2xl shadow-xs",
  thumb: "rounded-[4px]",
} as const;
// How far each gradient stop moves toward the field's average colour: the
// catalog declares a card's real contrast, the UI shows it quieter.
const SOFTEN = 0.35;
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const HEX_PAIRS = /[0-9a-f]{2}/giu;

const soften = (stops: readonly string[]): readonly string[] => {
  if (!stops.every((stop) => HEX_COLOR.test(stop))) {
    return stops;
  }
  const channels = stops.map((stop) =>
    (stop.slice(1).match(HEX_PAIRS) ?? []).map((pair) =>
      Number.parseInt(pair, 16)
    )
  );
  const mean = [0, 1, 2].map(
    (index) =>
      channels.reduce((sum, rgb) => sum + (rgb[index] ?? 0), 0) /
      channels.length
  );
  return channels.map(
    (rgb) =>
      `#${rgb
        .map((value, index) =>
          Math.round(value + ((mean[index] ?? value) - value) * SOFTEN)
            .toString(16)
            .padStart(2, "0")
        )
        .join("")}`
  );
};

// 3D only while the pointer is on it: an idle card needs no compositing layer.
const TILTABLE =
  "transition-transform duration-500 ease-out data-active:transform-[perspective(900px)_rotateX(var(--card-rx,0deg))_rotateY(var(--card-ry,0deg))] data-active:duration-100 motion-reduce:transition-none";

const Chip = ({ tone }: { tone: "silver" | "gold" }) => (
  <span
    className={cn(
      "relative block aspect-[1.3] w-[11cqw] overflow-hidden rounded-[1.4cqw] bg-linear-135 shadow-xs",
      tone === "gold"
        ? "from-chip-gold to-chip-gold-deep"
        : "from-chip-silver to-chip-silver-deep"
    )}
  >
    <svg
      className="stroke-shade absolute inset-0 size-full"
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 26 20"
    >
      <path
        d="M0 7h8m10 0h8M0 13h8m10 0h8M8 0v20m10-20v20M8 7h10v6H8Z"
        strokeWidth="0.7"
      />
    </svg>
  </span>
);

const Contactless = () => (
  <svg
    className="w-[4.4cqw] stroke-current opacity-80"
    fill="none"
    strokeLinecap="round"
    strokeWidth="1.6"
    viewBox="0 0 12 16"
  >
    <path d="M2 4.5a5 5 0 0 1 0 7M5.2 2.5a8.5 8.5 0 0 1 0 11M8.4.8a11.5 11.5 0 0 1 0 14.4" />
  </svg>
);

const Network = ({
  label,
  network,
  size,
}: {
  label?: string | null;
  network?: NetworkMarkKind | null;
  size: "compact" | "full" | "thumb";
}) => {
  if (network) {
    return (
      <NetworkMark
        className={cn(
          size === "full" && (network === "amex" ? "h-[12cqw]" : "h-[7.5cqw]"),
          size === "compact" && (network === "amex" ? "h-[14cqw]" : "h-[9cqw]"),
          size === "thumb" && "h-[14cqw]"
        )}
        network={network}
      />
    );
  }
  if (!label || size === "thumb") {
    return null;
  }
  return (
    <span className="text-[max(9px,3.6cqw)] font-bold tracking-wide uppercase opacity-90">
      {label}
    </span>
  );
};

interface FaceProps {
  chipTone: "silver" | "gold";
  issuer?: string | null;
  label: string;
  lastFour?: string | null;
  network?: NetworkMarkKind | null;
  networkLabel?: string | null;
  size: "compact" | "full" | "thumb";
}

/** What is printed on the card, laid out for its size. */
const Face = ({
  chipTone,
  issuer,
  label,
  lastFour,
  network,
  networkLabel,
  size,
}: FaceProps) => {
  if (size === "thumb") {
    return network ? (
      <div className="absolute right-[8cqw] bottom-[9cqw] flex">
        <Network network={network} size="thumb" />
      </div>
    ) : null;
  }
  if (size === "compact") {
    return (
      <div className="relative flex h-full flex-col justify-between p-[7cqw]">
        <div className="flex items-start justify-between gap-[4cqw]">
          <span className="truncate text-[max(10px,6.4cqw)] leading-none font-bold tracking-tight">
            {issuer}
          </span>
          {lastFour ? (
            <span className="shrink-0 text-[max(9px,5.6cqw)] leading-none font-medium tabular-nums opacity-90">
              •• {lastFour}
            </span>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-[4cqw]">
          <span className="line-clamp-2 text-[max(10px,6.2cqw)] leading-tight font-semibold">
            {label}
          </span>
          <Network label={networkLabel} network={network} size="compact" />
        </div>
      </div>
    );
  }
  return (
    <div className="relative flex h-full flex-col justify-between p-[6.5cqw]">
      <div className="flex items-start justify-between gap-[4cqw]">
        <span className="truncate text-[max(11px,5.2cqw)] leading-none font-bold tracking-tight">
          {issuer}
        </span>
        <span className="line-clamp-2 max-w-[55%] text-right text-[max(9px,3.5cqw)] leading-tight font-semibold tracking-wide uppercase opacity-85">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-[3cqw]">
        <Chip tone={chipTone} />
        <Contactless />
      </div>
      <div className="flex items-end justify-between gap-[4cqw]">
        <span className="text-[max(11px,5cqw)] leading-none font-medium tracking-[0.16em] tabular-nums">
          {lastFour ? `•••• ${lastFour}` : "•••• ••••"}
        </span>
        <Network label={networkLabel} network={network} size="full" />
      </div>
    </div>
  );
};

/** The card's pattern and motif, or the quiet default rings. */
const ArtLayer = ({ art, id }: { art?: CardArt | null; id: string }) => (
  <svg
    className="pointer-events-none absolute inset-0 size-full"
    preserveAspectRatio="xMidYMid slice"
    viewBox={`0 0 ${W} ${H}`}
  >
    {art?.pattern ? (
      <g opacity="0.7">
        <CardPattern id={`${id}-p`} name={art.pattern} />
      </g>
    ) : null}
    {art ? <CardMotif art={art} id={`${id}-m`} /> : <Rings id={`${id}-m`} />}
  </svg>
);

/** Which primitives drew the card, for tests to read without pixels. */
const artData = (art?: CardArt | null) => ({
  "data-ink": art?.ink ?? "light",
  "data-motif": art ? (art.motif ?? undefined) : "rings",
  "data-pattern": art?.pattern ?? undefined,
});

/** Tilts a card toward the pointer and lets it settle when the pointer leaves. */
const useTilt = (ref: React.RefObject<HTMLDivElement | null>) => {
  const tilt = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = ref.current;
    if (
      !card ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.style.setProperty("--card-rx", `${(0.5 - y) * TILT_DEGREES}deg`);
    card.style.setProperty("--card-ry", `${(x - 0.5) * TILT_DEGREES}deg`);
    card.style.setProperty("--card-gx", `${x * 100}%`);
    card.style.setProperty("--card-gy", `${y * 100}%`);
    card.dataset.active = "";
  };
  const settle = () => {
    const card = ref.current;
    if (!card) {
      return;
    }
    card.style.removeProperty("--card-rx");
    card.style.removeProperty("--card-ry");
    delete card.dataset.active;
  };
  return { settle, tilt };
};

export const CreditCardVisual = ({
  art,
  className,
  identity = art ? "product" : "generic",
  interactive = false,
  issuer,
  label,
  lastFour,
  network,
  networkLabel,
  size = "full",
  tint,
}: {
  art?: CardArt | null;
  className?: string;
  /** Whose look this is — a catalog product, a bank's colours or neither. */
  identity?: "product" | "issuer" | "generic";
  /** Tilts toward the pointer, like light catching a real card. */
  interactive?: boolean;
  issuer?: string | null;
  label: string;
  lastFour?: string | null;
  network?: NetworkMarkKind | null;
  /** Shown as text when the network has no mark. */
  networkLabel?: string | null;
  size?: "compact" | "full" | "thumb";
  tint?: string | null;
}): React.ReactElement => {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replaceAll(/[^a-zA-Z0-9_-]/gu, "");
  // Colours ride custom properties, so catalog edits need no new classes.
  const field = art
    ? `linear-gradient(${art.angle}deg, ${soften(art.stops).join(", ")})`
    : null;

  const { settle, tilt } = useTilt(ref);
  const [p0, p1, p2, p3, p4] = (art?.palette ?? []).slice(0, PALETTE_SLOTS);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "group/card @container relative isolate aspect-[1.586] w-full overflow-hidden select-none",
        SHELL[size],
        field ? "bg-(image:--card-face-field)" : paletteOf(tint).solid,
        art?.ink === "dark" ? "text-on-pale-tint" : "text-on-tint",
        interactive && TILTABLE,
        className
      )}
      {...artData(art)}
      data-identity={identity}
      data-size={size}
      data-slot="credit-card-visual"
      onPointerLeave={interactive ? settle : undefined}
      onPointerMove={interactive ? tilt : undefined}
      ref={ref}
      style={
        {
          "--card-face-accent": art?.accent ?? undefined,
          "--card-face-field": field ?? undefined,
          "--card-face-p0": p0,
          "--card-face-p1": p1,
          "--card-face-p2": p2,
          "--card-face-p3": p3,
          "--card-face-p4": p4,
        } as React.CSSProperties
      }
    >
      <ArtLayer art={art} id={id} />
      <span className="from-sheen to-shade pointer-events-none absolute inset-0 bg-linear-135 via-transparent opacity-35" />
      {interactive ? (
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--card-gx,50%)_var(--card-gy,0%),var(--color-sheen),transparent_50%)] opacity-0 transition-opacity duration-300 group-data-active/card:opacity-40" />
      ) : null}

      <Face
        chipTone={art?.chipTone ?? "silver"}
        issuer={issuer}
        label={label}
        lastFour={lastFour}
        network={network}
        networkLabel={networkLabel}
        size={size}
      />

      <span className="ring-shade/40 pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_var(--color-sheen)] ring-1 ring-inset" />
    </div>
  );
};
