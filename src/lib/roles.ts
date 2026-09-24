/**
 * Final E4CC staff roles. Legacy "evaluator" and "recruiter" rows are treated as
 * Recruitment; "viewer" is retired and grants no access. Applicants never have
 * staff accounts — they use their secure candidate link / Retake code.
 */
export const STAFF_ROLES = ["recruitment", "manager", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  recruitment: "Recruitment",
  manager: "Manager",
  evaluator: "Recruitment",
  recruiter: "Recruitment",
  viewer: "Retired (viewer)",
  applicant: "Applicant",
};

export function staffTier(roles: readonly string[]) {
  const isAdmin = roles.includes("admin");
  const isRecruitment =
    roles.includes("recruitment") || roles.includes("evaluator") || roles.includes("recruiter");
  const isManager = roles.includes("manager");
  const primary: StaffRole | null = isAdmin
    ? "admin"
    : isManager
      ? "manager"
      : isRecruitment
        ? "recruitment"
        : null;
  return { isAdmin, isRecruitment, isManager, isStaff: primary !== null, primary };
}

/** Normalises a stored role list to the single final role shown in the UI. */
export function primaryRole(roles: readonly string[]): StaffRole | null {
  return staffTier(roles).primary;
}

/** Display labels for the first-interview result (stored values are unchanged). */
export const RESULT_LABELS: Record<string, string> = {
  "Approved for last step": "Approved",
  "Retake required": "Retake",
  "Not approved": "Not Approved",
};
export const resultLabel = (value: string | null | undefined) =>
  value ? (RESULT_LABELS[value] ?? value) : "";

export const PENDING_SECOND_FILTER = "Pending Second Filter";
