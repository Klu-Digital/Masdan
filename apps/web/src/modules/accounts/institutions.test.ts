import { describe, expect, it } from "vite-plus/test";

import { resolveInstitution } from "./institutions";
import type { CatalogInstitution } from "./interest";

const institution = (
  id: string,
  name: string,
  aliases: string[]
): CatalogInstitution => ({
  aliases,
  brandColor: "#c8102e",
  countryCode: "PH",
  id,
  institutionType: "bank",
  key: `ph-${id}`,
  logoKey: id,
  name,
  shortName: aliases[0] ?? name,
  websiteUrl: null,
});

const CATALOG = [
  institution("bpi", "Bank of the Philippine Islands", ["BPI"]),
  institution("eastwest", "EastWest Bank", ["EastWest", "East West"]),
];

describe("resolveInstitution", () => {
  it("prefers the stored id", () => {
    expect(
      resolveInstitution(CATALOG, {
        institution: "BPI",
        institutionId: "eastwest",
      })?.id
    ).toBe("eastwest");
  });

  it("matches a typed name or alias, ignoring case and punctuation", () => {
    expect(resolveInstitution(CATALOG, { institution: "bpi" })?.id).toBe("bpi");
    expect(resolveInstitution(CATALOG, { institution: "East-West" })?.id).toBe(
      "eastwest"
    );
  });

  it("leaves an unknown bank to the generic tile", () => {
    expect(
      resolveInstitution(CATALOG, {
        institution: "Cooperative Bank of Nowhere",
      })
    ).toBeNull();
    expect(resolveInstitution(CATALOG, { institution: null })).toBeNull();
  });
});
