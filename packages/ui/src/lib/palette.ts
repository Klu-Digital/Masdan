/**
 * The 22 household colours categories, tags and accounts can carry. They only
 * ever tint small things — tiles, dots, chips — never surfaces or text blocks,
 * so a page of twenty categories stays calm.
 */
export const PALETTE = {
  amber: {
    dot: "bg-amber-500",
    soft: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
    solid: "bg-amber-500",
  },
  blue: {
    dot: "bg-blue-500",
    soft: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    solid: "bg-blue-500",
  },
  cyan: {
    dot: "bg-cyan-500",
    soft: "bg-cyan-500/13 text-cyan-700 dark:text-cyan-300",
    solid: "bg-cyan-500",
  },
  emerald: {
    dot: "bg-emerald-500",
    soft: "bg-emerald-500/13 text-emerald-700 dark:text-emerald-300",
    solid: "bg-emerald-500",
  },
  fuchsia: {
    dot: "bg-fuchsia-500",
    soft: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
    solid: "bg-fuchsia-500",
  },
  gray: {
    dot: "bg-gray-400",
    soft: "bg-gray-500/12 text-gray-700 dark:text-gray-300",
    solid: "bg-gray-500",
  },
  green: {
    dot: "bg-green-500",
    soft: "bg-green-500/13 text-green-700 dark:text-green-300",
    solid: "bg-green-500",
  },
  indigo: {
    dot: "bg-indigo-500",
    soft: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
    solid: "bg-indigo-500",
  },
  lime: {
    dot: "bg-lime-500",
    soft: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
    solid: "bg-lime-500",
  },
  neutral: {
    dot: "bg-neutral-400",
    soft: "bg-neutral-500/12 text-neutral-700 dark:text-neutral-300",
    solid: "bg-neutral-500",
  },
  orange: {
    dot: "bg-orange-500",
    soft: "bg-orange-500/13 text-orange-700 dark:text-orange-300",
    solid: "bg-orange-500",
  },
  pink: {
    dot: "bg-pink-500",
    soft: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
    solid: "bg-pink-500",
  },
  purple: {
    dot: "bg-purple-500",
    soft: "bg-purple-500/12 text-purple-700 dark:text-purple-300",
    solid: "bg-purple-500",
  },
  red: {
    dot: "bg-red-500",
    soft: "bg-red-500/12 text-red-700 dark:text-red-300",
    solid: "bg-red-500",
  },
  rose: {
    dot: "bg-rose-500",
    soft: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    solid: "bg-rose-500",
  },
  sky: {
    dot: "bg-sky-500",
    soft: "bg-sky-500/13 text-sky-700 dark:text-sky-300",
    solid: "bg-sky-500",
  },
  slate: {
    dot: "bg-slate-400",
    soft: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    solid: "bg-slate-500",
  },
  stone: {
    dot: "bg-stone-400",
    soft: "bg-stone-500/12 text-stone-700 dark:text-stone-300",
    solid: "bg-stone-500",
  },
  teal: {
    dot: "bg-teal-500",
    soft: "bg-teal-500/13 text-teal-700 dark:text-teal-300",
    solid: "bg-teal-500",
  },
  violet: {
    dot: "bg-violet-500",
    soft: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    solid: "bg-violet-500",
  },
  yellow: {
    dot: "bg-yellow-500",
    soft: "bg-yellow-500/16 text-yellow-700 dark:text-yellow-300",
    solid: "bg-yellow-500",
  },
  zinc: {
    dot: "bg-zinc-400",
    soft: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-300",
    solid: "bg-zinc-500",
  },
} as const;

export type PaletteColor = keyof typeof PALETTE;

export const PALETTE_COLORS = Object.keys(PALETTE) as PaletteColor[];

export const isPaletteColor = (
  value: string | null | undefined
): value is PaletteColor =>
  typeof value === "string" && Object.hasOwn(PALETTE, value);

export const paletteOf = (value: string | null | undefined) =>
  PALETTE[isPaletteColor(value) ? value : "slate"];
