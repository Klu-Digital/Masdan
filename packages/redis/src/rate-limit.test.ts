import { describe, expect, it } from "vite-plus/test";

import { createLocalCounter } from "./rate-limit";

const clock = () => {
  let at = 1_000_000;
  return {
    advance: (ms: number) => {
      at += ms;
    },
    now: () => at,
  };
};

describe("createLocalCounter", () => {
  it("counts hits within a window and restarts once it closes", () => {
    const time = clock();
    const counter = createLocalCounter({ now: time.now });

    expect(counter.increment("a", 10)).toBe(1);
    expect(counter.increment("a", 10)).toBe(2);
    time.advance(9999);
    expect(counter.increment("a", 10)).toBe(3);
    time.advance(1);
    expect(counter.increment("a", 10)).toBe(1);
  });

  it("keeps keys independent", () => {
    const counter = createLocalCounter();

    counter.increment("a", 10);
    expect(counter.increment("b", 10)).toBe(1);
  });

  it("drops expired windows, then the oldest, once full", () => {
    const time = clock();
    const counter = createLocalCounter({ maxKeys: 2, now: time.now });

    counter.increment("short", 1);
    counter.increment("long", 60);
    counter.increment("long", 60);
    time.advance(1000);
    // `short` has expired, so making room for `c` keeps `long`'s count.
    counter.increment("c", 60);
    expect(counter.increment("long", 60)).toBe(3);

    // Nothing has expired now: the oldest window (`long`) goes.
    counter.increment("d", 60);
    expect(counter.increment("long", 60)).toBe(1);
  });
});
