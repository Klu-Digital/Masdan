import { motion } from "./loop";
import type { Actor } from "./loop";

/**
 * Lifts an element off the page: a positive depth makes it outrun the scroll,
 * as something nearer the reader would.
 */
export const planeActor = (el: HTMLElement, depth: number): Actor => {
  let shift = 0;
  const actor: Actor = {
    dirty: true,
    el,
    frame() {
      const rect = el.getBoundingClientRect();
      // Measured without our own translate, or the offset chases itself.
      const offset =
        rect.top - shift + rect.height / 2 - window.innerHeight / 2;
      const next = motion.still ? 0 : Math.round(offset * depth);
      if (next !== shift) {
        shift = next;
        el.style.translate = shift ? `0 ${shift}px` : "";
      }
      return !motion.still;
    },
    resize() {
      actor.dirty = true;
    },
    retone() {
      actor.dirty = true;
    },
    visible: false,
  };
  return actor;
};
