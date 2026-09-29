import { usePrefersReducedMotion } from "@masdan/ui/hooks/use-prefers-reduced-motion";
import { useEffect, useRef, useState } from "react";

/** Damping 1.0 at response 0.45s: a value glides to its new target, no overshoot. */
const RESPONSE_SECONDS = 0.45;
const OMEGA = (2 * Math.PI) / RESPONSE_SECONDS;
const SETTLE_EPSILON = 0.005;

/**
 * Tweens a displayed number toward `target` on a critically damped spring.
 * Retargeting mid-flight starts from the on-screen value and keeps the current
 * velocity, so rapid updates never jump or stall. The first render is exact,
 * and with motion disabled the target is returned as-is.
 */
export const useSpringNumber = (target: number, enabled = true): number => {
  const reducedMotion = usePrefersReducedMotion();
  const active = enabled && !reducedMotion;
  const [display, setDisplay] = useState(target);
  const state = useRef({ position: target, velocity: 0 });

  useEffect(() => {
    if (!active) {
      state.current = { position: target, velocity: 0 };
      return;
    }

    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const { position, velocity } = state.current;
      const acceleration =
        -OMEGA * OMEGA * (position - target) - 2 * OMEGA * velocity;
      const nextVelocity = velocity + acceleration * dt;
      const nextPosition = position + nextVelocity * dt;
      const scale = Math.max(Math.abs(target), 1);
      const settled =
        Math.abs(nextPosition - target) / scale < SETTLE_EPSILON / 100 &&
        Math.abs(nextVelocity) / scale < SETTLE_EPSILON;
      state.current = settled
        ? { position: target, velocity: 0 }
        : { position: nextPosition, velocity: nextVelocity };
      setDisplay(state.current.position);
      if (!settled) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return active ? display : target;
};
