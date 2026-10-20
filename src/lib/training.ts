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

/** Attendance / progress status set by the Trainer. Certification is a separate final result. */
export const TRAINING_STATUSES = [
  "RECLUTADO",
  "IN TRAINING",
  "NO SHOW",
  "DROP OUT BEFORE TRAINING",
  "DROP OUT DURING TRAINING",
  "CERTIFIED",
  "NOT CERTIFIED",
  "BANCA",
] as const;
export const PENDING_SPOT = "PENDIENTE DE RECLUTAR";
/** Certification lives in the same status dropdown; it is mirrored to the certification field for metrics. */
export function certificationFromStatus(status: string) {
  return status === "CERTIFIED" || status === "NOT CERTIFIED" ? status : "PENDIENTE";
}
/** Candidates with these statuses no longer hold a requisition spot (the spot reopens). */
export const RELEASES_SPOT = ["DROP OUT BEFORE TRAINING", "NO SHOW"];

type SpotLite = { group: string; waveStart: string | null; spotType: string; agreedSchedule: string; branch: string; requestDate: string | null };
type HeldLite = { group: string; waveStart: string | null; status: string };
/** Open spots per requisition wave = requested spots minus candidates still holding one in the same LOB and wave. */
export function openSpots<T extends SpotLite>(spots: T[], rows: HeldLite[]): T[] {
  const held = new Map<string, number>();
  for (const r of rows) if (!RELEASES_SPOT.includes(r.status)) {
    const k = `${r.group}|${r.waveStart ?? ""}`;
    held.set(k, (held.get(k) ?? 0) + 1);
  }
  const ordered = [...spots].sort((a, b) => (a.spotType === b.spotType ? 0 : a.spotType === "NEEDED" ? -1 : 1));
  return ordered.filter((s) => {
    const k = `${s.group}|${s.waveStart ?? ""}`;
    const n = held.get(k) ?? 0;
    if (n > 0) { held.set(k, n - 1); return false; }
    return true;
  });
}
/** Minimum hires per week to fill the open spots before the wave starts (at least one week). */
export function weeklyMinimum(open: number, waveStart: string | null, today: string) {
  if (!open) return 0;
  const days = waveStart ? Math.ceil((Date.parse(`${waveStart}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : 7;
  return Math.ceil(open / Math.max(1, Math.ceil(days / 7)));
}

export const CERTIFICATION_VALUES = ["PENDIENTE", "CERTIFIED", "NOT CERTIFIED"] as const;
export const DAY1_VALUES = ["pending", "continues", "dropped"] as const;
export const DAY1_LABELS: Record<(typeof DAY1_VALUES)[number], string> = {
  pending: "Pendiente contacto",
  continues: "Continúa en training",
  dropped: "Dropeó",
};

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

export const SUMMARY_STATUSES = ["PENDIENTE DE RECLUTAR", "RECLUTADO", "IN TRAINING", "NO SHOW", "DROP OUT BEFORE TRAINING", "DROP OUT DURING TRAINING", "CERTIFIED", "NOT CERTIFIED", "BANCA"] as const;
/** Count and share of each status; open requisition spots count as PENDIENTE DE RECLUTAR. */
export function statusSummary(rows: { status: string }[], pendingSpots: number) {
  const total = rows.length + pendingSpots;
  const counts: Record<string, number> = Object.fromEntries(SUMMARY_STATUSES.map((s) => [s, 0]));
  counts[PENDING_SPOT] = pendingSpots;
  for (const r of rows) if (r.status in counts) counts[r.status]++;
  return { total, items: SUMMARY_STATUSES.map((s) => ({ status: s, count: counts[s], pct: total ? Math.round((counts[s] / total) * 100) : 0 })) };
}
