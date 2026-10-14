/** Client-safe referral rules: public status mapping shown to collaborators. */
export const PUBLIC_STATUSES = [
  "Recibido",
  "En contacto",
  "Entrevista pendiente",
  "En evaluación",
  "Retake pendiente",
  "Aprobado para training",
  "En training",
  "Certificado",
  "Proceso finalizado",
] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const BONUS_STATUSES = ["En validación", "En espera", "En revisión", "Reportado", "Pagado"] as const;
export type BonusStatus = (typeof BONUS_STATUSES)[number];

export const normalizeEmail = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").toLowerCase();
export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/**
 * Maps internal pipeline state to a neutral public status. Closures never reveal
 * the reason (not approved, no show, withdrawn, dropped all read "Proceso finalizado").
 */
export function publicStatus(input: {
  linked: boolean;
  appStatus?: string | null | undefined;
  hasActiveAppointment?: boolean | undefined;
  trainingStatus?: string | null | undefined;
}): PublicStatus {
  if (!input.linked) return "Recibido";
  const t = (input.trainingStatus ?? "").toUpperCase();
  if (t === "CERTIFIED") return "Certificado";
  if (t === "IN TRAINING") return "En training";
  if (["NO SHOW", "DROP OUT BEFORE TRAINING", "DROP OUT DURING TRAINING", "NOT CERTIFIED", "NOT APPROVED"].includes(t)) {
    return "Proceso finalizado";
  }
  const s = (input.appStatus ?? "").toLowerCase();
  if (s.startsWith("approved for training")) return "Aprobado para training";
  if (s.startsWith("not approved") || s.startsWith("rejected") || s.startsWith("not eligible") || s.startsWith("withdrawn") || s.startsWith("no show")) {
    return "Proceso finalizado";
  }
  if (s.includes("retake")) return "Retake pendiente";
  if (s === "pending second filter" || s === "interview completed" || s === "reviewing" || s === "qualified") return "En evaluación";
  if (input.hasActiveAppointment || s === "scheduling opened") return "Entrevista pendiente";
  if (s === "waiting list") return "En contacto";
  return "En contacto";
}
