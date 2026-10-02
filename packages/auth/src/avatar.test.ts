import { describe, expect, it } from "vite-plus/test";

import { MAX_AVATAR_LENGTH, isAvatarImage } from "./avatar";

describe("isAvatarImage", () => {
  it("accepts an inline raster image or a cleared one", () => {
    expect(isAvatarImage("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isAvatarImage("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isAvatarImage(null)).toBe(true);
    expect(isAvatarImage()).toBe(true);
    expect(isAvatarImage("")).toBe(true);
  });

  it("rejects remote URLs, SVG and oversized images", () => {
    expect(isAvatarImage("https://tracker.example/pixel.png")).toBe(false);
    expect(isAvatarImage("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isAvatarImage("data:image/png;base64,<script>")).toBe(false);
    expect(
      isAvatarImage(`data:image/png;base64,${"A".repeat(MAX_AVATAR_LENGTH)}`)
    ).toBe(false);
    expect(isAvatarImage(42)).toBe(false);
  });
});
