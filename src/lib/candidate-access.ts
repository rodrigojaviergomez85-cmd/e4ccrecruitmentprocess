/** Countryless Calendly bookings can be reviewed by interview staff until their country is confirmed. */
export function canAccessCandidate(
  allowedCountries: string[] | null,
  roles: string[],
  candidate: { country_code?: string | null; source?: string | null },
) {
  if (allowedCountries === null) return true;
  if (candidate.country_code) return allowedCountries.includes(candidate.country_code);
  return candidate.source === "calendly" && roles.some((role) =>
    ["admin", "recruitment", "recruiter", "evaluator", "manager"].includes(role),
  );
}