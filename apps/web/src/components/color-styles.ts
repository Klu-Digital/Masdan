import type { TailwindColor } from "@masdan/api/colors";

interface ColorStyles {
  badge: string;
  ring: string;
  swatch: string;
}

export const COLOR_STYLES = {
  amber: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    ring: "ring-amber-500 dark:ring-amber-400",
    swatch: "bg-amber-500 dark:bg-amber-400",
  },
  blue: {
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    ring: "ring-blue-500 dark:ring-blue-400",
    swatch: "bg-blue-500 dark:bg-blue-400",
  },
  cyan: {
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    ring: "ring-cyan-500 dark:ring-cyan-400",
    swatch: "bg-cyan-500 dark:bg-cyan-400",
  },
  emerald: {
    badge:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    ring: "ring-emerald-500 dark:ring-emerald-400",
    swatch: "bg-emerald-500 dark:bg-emerald-400",
  },
  fuchsia: {
    badge:
      "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
    ring: "ring-fuchsia-500 dark:ring-fuchsia-400",
    swatch: "bg-fuchsia-500 dark:bg-fuchsia-400",
  },
  gray: {
    badge: "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200",
    ring: "ring-gray-500 dark:ring-gray-400",
    swatch: "bg-gray-500 dark:bg-gray-400",
  },
  green: {
    badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    ring: "ring-green-500 dark:ring-green-400",
    swatch: "bg-green-500 dark:bg-green-400",
  },
  indigo: {
    badge:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
    ring: "ring-indigo-500 dark:ring-indigo-400",
    swatch: "bg-indigo-500 dark:bg-indigo-400",
  },
  lime: {
    badge: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200",
    ring: "ring-lime-500 dark:ring-lime-400",
    swatch: "bg-lime-500 dark:bg-lime-400",
  },
  neutral: {
    badge:
      "bg-neutral-100 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200",
    ring: "ring-neutral-500 dark:ring-neutral-400",
    swatch: "bg-neutral-500 dark:bg-neutral-400",
  },
  orange: {
    badge:
      "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    ring: "ring-orange-500 dark:ring-orange-400",
    swatch: "bg-orange-500 dark:bg-orange-400",
  },
  pink: {
    badge: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
    ring: "ring-pink-500 dark:ring-pink-400",
    swatch: "bg-pink-500 dark:bg-pink-400",
  },
  purple: {
    badge:
      "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
    ring: "ring-purple-500 dark:ring-purple-400",
    swatch: "bg-purple-500 dark:bg-purple-400",
  },
  red: {
    badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    ring: "ring-red-500 dark:ring-red-400",
    swatch: "bg-red-500 dark:bg-red-400",
  },
  rose: {
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
    ring: "ring-rose-500 dark:ring-rose-400",
    swatch: "bg-rose-500 dark:bg-rose-400",
  },
  sky: {
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    ring: "ring-sky-500 dark:ring-sky-400",
    swatch: "bg-sky-500 dark:bg-sky-400",
  },
  slate: {
    badge: "bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-200",
    ring: "ring-slate-500 dark:ring-slate-400",
    swatch: "bg-slate-500 dark:bg-slate-400",
  },
  stone: {
    badge: "bg-stone-100 text-stone-800 dark:bg-stone-950 dark:text-stone-200",
    ring: "ring-stone-500 dark:ring-stone-400",
    swatch: "bg-stone-500 dark:bg-stone-400",
  },
  teal: {
    badge: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
    ring: "ring-teal-500 dark:ring-teal-400",
    swatch: "bg-teal-500 dark:bg-teal-400",
  },
  violet: {
    badge:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    ring: "ring-violet-500 dark:ring-violet-400",
    swatch: "bg-violet-500 dark:bg-violet-400",
  },
  yellow: {
    badge:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
    ring: "ring-yellow-500 dark:ring-yellow-400",
    swatch: "bg-yellow-500 dark:bg-yellow-400",
  },
  zinc: {
    badge: "bg-zinc-100 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200",
    ring: "ring-zinc-500 dark:ring-zinc-400",
    swatch: "bg-zinc-500 dark:bg-zinc-400",
  },
} satisfies Record<TailwindColor, ColorStyles>;

export const isTailwindColor = (value: string): value is TailwindColor =>
  Object.hasOwn(COLOR_STYLES, value);

export const colorClass = (value: string): string =>
  isTailwindColor(value) ? COLOR_STYLES[value].badge : COLOR_STYLES.slate.badge;
