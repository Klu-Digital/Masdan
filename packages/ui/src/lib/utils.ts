import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Our motion tokens, so `cn` treats a later `ease-*`/`animate-*` as an override. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      animate: [{ animate: ["enter", "fade", "grow-y", "skeleton"] }],
      ease: [{ ease: ["spring", "spring-bounce", "out-quint"] }],
    },
  },
});

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
