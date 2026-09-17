import { describe, expect, it } from "vite-plus/test";

import { buildObjectKey, sanitizeFileName } from "./keys";

describe("sanitizeFileName", () => {
  it("keeps an ordinary name intact", () => {
    expect(sanitizeFileName("quarterly-report.pdf")).toBe(
      "quarterly-report.pdf"
    );
  });

  it("keeps only the last segment of a POSIX traversal attempt", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
  });

  it("keeps only the last segment of a Windows path", () => {
    expect(sanitizeFileName("C:\\Users\\kevin\\secret.txt")).toBe("secret.txt");
  });

  it("never returns a name containing a path separator", () => {
    for (const input of ["a/b/c.png", "a\\b\\c.png", "..//..//x"]) {
      expect(sanitizeFileName(input)).not.toMatch(/[/\\]/u);
    }
  });

  it("strips control characters", () => {
    expect(sanitizeFileName("re\u0000port\u001F.pdf")).toBe("report.pdf");
  });

  it("replaces characters outside the allowed set with a single hyphen", () => {
    expect(sanitizeFileName("in%voi#ce?.pdf")).toBe("in-voi-ce-.pdf");
  });

  it("drops a leading dot so the object is not hidden on download", () => {
    expect(sanitizeFileName(".env")).toBe("env");
  });

  it("falls back when nothing usable survives", () => {
    expect(sanitizeFileName("///")).toBe("file");
    expect(sanitizeFileName("...")).toBe("file");
    expect(sanitizeFileName("")).toBe("file");
  });

  it("preserves unicode letters and digits", () => {
    expect(sanitizeFileName("отчёт-2026.pdf")).toBe("отчёт-2026.pdf");
    expect(sanitizeFileName("日本語.png")).toBe("日本語.png");
  });

  it("clamps a long name while keeping its extension", () => {
    const result = sanitizeFileName(`${"a".repeat(400)}.pdf`);

    expect(result).toHaveLength(200);
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it("clamps a long name with no plausible extension", () => {
    expect(sanitizeFileName("b".repeat(400))).toHaveLength(200);
  });
});

describe("buildObjectKey", () => {
  const organizationId = "0199c3f0-0000-7000-8000-000000000001";
  const objectId = "0199c3f0-0000-7000-8000-000000000002";

  it("builds an org-prefixed key", () => {
    expect(
      buildObjectKey({ name: "photo.png", objectId, organizationId })
    ).toBe(`org/${organizationId}/${objectId}/photo.png`);
  });

  it("cannot be escaped by a traversal filename", () => {
    const key = buildObjectKey({
      name: "../../../../root.png",
      objectId,
      organizationId,
    });

    expect(key).toBe(`org/${organizationId}/${objectId}/root.png`);
    expect(key.startsWith(`org/${organizationId}/`)).toBe(true);
    expect(key.split("/")).toHaveLength(4);
  });
});
