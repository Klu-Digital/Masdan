import { describe, expect, it } from "vite-plus/test";

import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("formats missing, kilobyte, and megabyte values", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(512)).toBe("0.5 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });
});
