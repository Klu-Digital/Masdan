import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vite-plus/test";

afterEach(cleanup);

// jsdom does not implement `matchMedia`, which next-themes requires.
Object.defineProperty(window, "matchMedia", {
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
  writable: true,
});

// jsdom does not implement `ResizeObserver`, which the ECharts charts require.
globalThis.ResizeObserver = class {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
};

// jsdom's canvas has no 2D context, and ECharts' canvas renderer crashes on
// the `null` it returns. Every draw call becomes a no-op on a stub.
const noop = (): unknown => new Proxy({}, { get: () => noop });
const stubCanvasContext = (canvas: HTMLCanvasElement) => {
  const state: Record<PropertyKey, unknown> = { canvas };
  return new Proxy(state, {
    get: (target, key) => {
      if (key === "measureText") {
        return (text: string) => ({ width: text.length * 6 });
      }
      if (key === "getImageData") {
        return (_x: number, _y: number, width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        });
      }
      if (key === "getLineDash") {
        return () => [];
      }
      return key in target ? target[key] : noop;
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
};
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value(this: HTMLCanvasElement) {
    return stubCanvasContext(this);
  },
  writable: true,
});

// jsdom does not implement `getAnimations`, which Base UI's ScrollArea calls
// from a timer — the throw lands outside any test and fails the whole run.
Element.prototype.getAnimations = () => [];
