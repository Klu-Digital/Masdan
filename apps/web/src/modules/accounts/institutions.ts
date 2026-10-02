import { normalizeCardText } from "@masdan/card-catalog/catalog";
import { useQuery } from "@tanstack/react-query";

import { interestCatalogQuery } from "./interest";
import type { CatalogInstitution } from "./interest";

export interface InstitutionIdentity {
  institution?: string | null;
  institutionId?: string | null;
}

// Falls back to the typed name, so pre-catalog accounts still match.
export const resolveInstitution = (
  institutions: readonly CatalogInstitution[],
  { institution, institutionId }: InstitutionIdentity
): CatalogInstitution | null => {
  if (institutionId) {
    const byId = institutions.find(({ id }) => id === institutionId);
    if (byId) {
      return byId;
    }
  }
  const text = normalizeCardText(institution ?? "");
  if (!text) {
    return null;
  }
  return (
    institutions.find((candidate) =>
      [candidate.name, candidate.shortName, ...candidate.aliases].some(
        (alias) => normalizeCardText(alias) === text
      )
    ) ?? null
  );
};

export const useInstitutionOf = (
  identity: InstitutionIdentity
): CatalogInstitution | null => {
  const catalog = useQuery(interestCatalogQuery());
  return resolveInstitution(catalog.data?.institutions ?? [], identity);
};
