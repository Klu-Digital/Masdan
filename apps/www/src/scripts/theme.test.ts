import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { expect, it, vi } from "vite-plus/test";

const layout = readFileSync(
  new URL("../layouts/base.astro", import.meta.url),
  "utf-8"
);
const script = layout.match(/<script is:inline>(?<script>[\s\S]*?)<\/script>/u)
  ?.groups?.script;

const setup = (stored: string | null = null, blocked = false) => {
  const toggle = Object.assign(new EventTarget(), { setAttribute: vi.fn() });
  const system = Object.assign(new EventTarget(), { matches: true });
  const root = { classList: { add: vi.fn() }, dataset: { theme: "" } };
  const favicon = { href: "" };
  const meta = { content: "" };
  const document = Object.assign(new EventTarget(), {
    documentElement: root,
    getElementById: () => toggle,
    querySelector: (selector: string) =>
      selector === 'link[rel="icon"]' ? favicon : meta,
  });
  const localStorage = {
    getItem: () => {
      if (blocked) {
        throw new Error("Storage blocked");
      }
      return stored;
    },
    setItem: vi.fn(() => {
      if (blocked) {
        throw new Error("Storage blocked");
      }
    }),
  };
  const changed = vi.fn();
  document.addEventListener("themechange", changed);
  if (!script) {
    throw new Error("Theme initialization script missing");
  }
  runInNewContext(script, {
    Event,
    document,
    localStorage,
    matchMedia: () => system,
  });
  document.dispatchEvent(new Event("DOMContentLoaded"));
  return { changed, favicon, localStorage, meta, root, system, toggle };
};

it("uses the system theme, then persists an explicit choice and repaints artwork", () => {
  const { changed, favicon, localStorage, meta, root, toggle, system } =
    setup();
  expect(root.dataset.theme).toBe("dark");
  expect(toggle.setAttribute).toHaveBeenLastCalledWith("aria-pressed", "true");
  system.matches = false;
  system.dispatchEvent(new Event("change"));
  expect(root.dataset.theme).toBe("light");
  expect(toggle.setAttribute).toHaveBeenLastCalledWith("aria-pressed", "false");
  toggle.dispatchEvent(new Event("click"));
  expect(toggle.setAttribute).toHaveBeenLastCalledWith("aria-pressed", "true");
  expect(root.dataset.theme).toBe("dark");
  expect(favicon.href).toBe("/favicon-dark.png");
  expect(meta.content).toBe("#151517");
  expect(localStorage.setItem).toHaveBeenCalledWith("www-theme", "dark");
  expect(changed).toHaveBeenCalledTimes(3);
  system.dispatchEvent(new Event("change"));
  expect(root.dataset.theme).toBe("dark");
});

it("restores saved light mode even when the system is dark", () => {
  const { favicon, root, toggle } = setup("light");
  expect(root.dataset.theme).toBe("light");
  expect(toggle.setAttribute).toHaveBeenLastCalledWith("aria-pressed", "false");
  expect(favicon.href).toBe("/favicon-light.png");
});

it("ignores invalid preferences and still switches when storage is blocked", () => {
  expect(setup("invalid").root.dataset.theme).toBe("dark");
  const { root, toggle } = setup(null, true);
  toggle.dispatchEvent(new Event("click"));
  expect(root.dataset.theme).toBe("light");
  expect(toggle.setAttribute).toHaveBeenLastCalledWith("aria-pressed", "false");
  toggle.dispatchEvent(new Event("click"));
  expect(root.dataset.theme).toBe("dark");
});
