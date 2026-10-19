/** Official E4CC onsite branches per country, and countries accepted for Online. */
export const ONSITE_BRANCHES: Record<string, string[]> = {
  NI: ["Las Americas", "Metrocentro Nicaragua", "Las Brisas", "Masaya"],
  SV: ["Plaza Mundo", "Metrosur", "San Marcos", "Plaza Merliot", "Plaza Lourdes", "Santa Ana"],
  GT: ["Metronorte", "Metrocentro Villanueva", "San Jose Pinula", "Galerias Primma"],
};

export const ONSITE_LOB: Record<string, string> = { NI: "NICARAGUA", SV: "EL SALVADOR", GT: "GUATEMALA" };

export const ONLINE_COUNTRIES = ["SV", "GT", "NI", "MX", "HN", "CO"] as const;

export function branchesFor(countryCode: string | null | undefined): string[] {
  return ONSITE_BRANCHES[countryCode ?? ""] ?? [];
}

export function onsiteLobFor(countryCode: string | null | undefined): string {
  return ONSITE_LOB[countryCode ?? ""] ?? "";
}
