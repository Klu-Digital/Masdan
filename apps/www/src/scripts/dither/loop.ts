export interface Actor {
  readonly el: Element;
  visible: boolean;
  dirty: boolean;
  /** Paints one frame; returns whether it wants the next one. */
  frame: (now: number) => boolean;
  resize: () => void;
  retone: () => void;
  /** Called when the actor scrolls out of view. */
  leave?: () => void;
}

const reduce = matchMedia("(prefers-reduced-motion: reduce)");

export const motion = { still: reduce.matches };

export const parallax = (el: Element): number => {
  if (motion.still) {
    return 0;
  }
  const rect = el.getBoundingClientRect();
  return rect.top + rect.height / 2 - window.innerHeight / 2;
};

const actors = new Map<Element, Actor>();
let handle = 0;

const tick = (now: number): void => {
  handle = 0;
  let again = false;
  for (const actor of actors.values()) {
    if (actor.visible && actor.frame(now)) {
      again = true;
    }
  }
  if (again && !handle) {
    handle = requestAnimationFrame(tick);
  }
};

/** Schedules the one shared frame; a no-op while one is already queued. */
export const wake = (): void => {
  if (!handle) {
    handle = requestAnimationFrame(tick);
  }
};

const redrawAll = (retone: boolean): void => {
  for (const actor of actors.values()) {
    if (retone) {
      actor.retone();
    }
    actor.dirty = true;
  }
  wake();
};

const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const actor = actors.get(entry.target);
      if (actor) {
        actor.visible = entry.isIntersecting;
        if (!actor.visible) {
          actor.leave?.();
        }
      }
    }
    wake();
  },
  { rootMargin: "64px 0px" }
);

const size = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const actor = actors.get(entry.target);
    if (actor) {
      actor.resize();
      actor.dirty = true;
    }
  }
  wake();
});

reduce.addEventListener("change", () => {
  motion.still = reduce.matches;
  redrawAll(false);
});
document.addEventListener("themechange", () => redrawAll(true));

export const register = (actor: Actor): void => {
  actors.set(actor.el, actor);
  visibility.observe(actor.el);
  size.observe(actor.el);
};
