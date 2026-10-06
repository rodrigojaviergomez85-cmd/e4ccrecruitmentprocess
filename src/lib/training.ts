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
