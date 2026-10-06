import { staffTier } from "./roles";

export const TRAINING_GROUPS = ["ONLINE", "EL SALVADOR", "NICARAGUA", "GUATEMALA"] as const;
export function trainingGroup(modality: string | null, countryCode: string | null) {
  if (modality === "online") return "ONLINE";
  return ({ SV: "EL SALVADOR", NI: "NICARAGUA", GT: "GUATEMALA" } as Record<string, string>)[countryCode ?? ""] ?? "OTROS";
}

export function trainingPermissions(roles: readonly string[]) {
  const t = staffTier(roles);
  return {
    canEditDocuments: t.isAdmin || t.isGeneralista,
    canEditReferences: t.isAdmin || t.isRecruitment,
    canEditTraining: t.isStaff || t.isTrainer,
    canManageRequisitions: t.isStaff,
    trainingOnly: t.canSignIn && !t.isStaff,
  };
}

export const TRAINING_STATUSES = [
  "RECLUTADO",
  "IN TRAINING",
  "PENDING 2ND FILTRO",
  "NO SHOW",
  "DROP OUT BEFORE TRAINING",
  "DROP OUT DURING TRAINING",
  "NOT CERTIFIED",
  "CERTIFIED",
  "NOT APPROVED",
  "BANCA",
] as const;

export const REFERENCE_CALL_VALUES = ["pending", "done", "not_recommended"] as const;
export type ReferenceCall = (typeof REFERENCE_CALL_VALUES)[number];

/** A candidate's approval stays red until Recruitment records the reference call. */
export function approvalBlocked(referenceCall: string) {
  return referenceCall !== "done";
}

export function documentsPercent(list: string[], checked: Record<string, boolean>) {
  if (!list.length) return 0;
  return Math.round((list.filter((d) => checked[d]).length / list.length) * 100);
}

export const SPOT_TYPES = ["NEEDED", "BACKUP"] as const;

/** Requisition spots stay open until a candidate is assigned. */
export function requisitionSummary(spots: { filledApplicationId: string | null }[]) {
  const filled = spots.filter((s) => s.filledApplicationId).length;
  return { total: spots.length, filled, open: spots.length - filled };
}
