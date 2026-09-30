import type React from "react";

export type CardPatternName =
  | "angular-panels"
  | "brushed"
  | "color-blocks"
  | "crossed-light"
  | "diagonal-lines"
  | "dot-matrix"
  | "fine-lines"
  | "halftone"
  | "hexagons"
  | "pinstripes"
  | "pixels"
  | "scallops"
  | "topographic";

export type CardMotifName =
  | "arc-lines"
  | "bolt"
  | "chevron"
  | "chevron-framed"
  | "chevron-stripes"
  | "co-brand-stripe"
  | "contours"
  | "dot-field"
  | "facets"
  | "facets-left"
  | "frame"
  | "globe"
  | "hex-rings"
  | "horizon"
  | "medallion"
  | "monogram"
  | "orbit"
  | "oversized-letter"
  | "peaks"
  | "planet"
  | "radial-dots"
  | "s-ribbon"
  | "side-band"
  | "silk"
  | "skyline"
  | "speed-lines"
  | "sunburst"
  | "sweep"
  | "tiles"
  | "travel-seal"
  | "wave-ribbon"
  | "wing-stripe"
  | "wordmark";

/** A card's field, declared as data: every product composes the same primitives. */
export interface CardArt {
  accent?: string | null;
  angle: number;
  chipTone?: "silver" | "gold" | null;
  /** Text ink: light on dark fields, dark on pale ones. */
  ink: "light" | "dark";
  monogram?: string | null;
  motif?: CardMotifName | null;
  /** Extra colours for multi-colour motifs, in the order the motif uses them. */
  palette?: readonly string[] | null;
  pattern?: CardPatternName | null;
  stops: readonly string[];
}

// The art is drawn on a card-shaped canvas and sliced to fit, so it scales.
export const W = 320;
export const H = 202;
export const ACCENT_FILL = "fill-[var(--card-face-accent,currentColor)]";
export const ACCENT_STROKE = "stroke-[var(--card-face-accent,currentColor)]";
// Static class names per palette slot: Tailwind can't see computed ones.
export const PALETTE_FILL = [
  "fill-[var(--card-face-p0,currentColor)]",
  "fill-[var(--card-face-p1,currentColor)]",
  "fill-[var(--card-face-p2,currentColor)]",
  "fill-[var(--card-face-p3,currentColor)]",
  "fill-[var(--card-face-p4,currentColor)]",
] as const;
export const PALETTE_STROKE = [
  "stroke-[var(--card-face-p0,currentColor)]",
  "stroke-[var(--card-face-p1,currentColor)]",
  "stroke-[var(--card-face-p2,currentColor)]",
  "stroke-[var(--card-face-p3,currentColor)]",
  "stroke-[var(--card-face-p4,currentColor)]",
] as const;
export const PALETTE_STOP = [
  "[stop-color:var(--card-face-p0,currentColor)]",
  "[stop-color:var(--card-face-p1,currentColor)]",
  "[stop-color:var(--card-face-p2,currentColor)]",
  "[stop-color:var(--card-face-p3,currentColor)]",
  "[stop-color:var(--card-face-p4,currentColor)]",
] as const;
export const PALETTE_SLOTS = PALETTE_FILL.length;

export const lines = (
  count: number,
  draw: (index: number) => React.ReactNode
) => Array.from({ length: count }, (_, index) => draw(index));

// Seeded, so a card's facets and skyline are identical on every render.
export const random = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
};

export const slots = (art: CardArt) =>
  Math.max(1, Math.min(art.palette?.length ?? 0, PALETTE_SLOTS));

/** One motif: a card's single focal element, drawn on the W×H canvas. */
export type Motif = (props: {
  art: CardArt;
  /** Unique per card, for the motif's own gradient and clip-path ids. */
  id: string;
}) => React.ReactElement | null;
