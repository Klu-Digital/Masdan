import Lenis from "lenis";

const reduce = matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Eases wheel scrolling so the parallax layers glide instead of stepping with
 * each wheel notch. Touch keeps native momentum, and reduced motion keeps the
 * browser's own scrolling.
 */
if (!reduce.matches) {
  const lenis = new Lenis({ lerp: 0.1 });
  const raf = (time: number): void => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
