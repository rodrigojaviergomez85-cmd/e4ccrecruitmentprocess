/** Pure helpers for the Recruitment Scorecard (shared by server and tests). */

export type ApptLite = { status: string; starts_at: string; calendly_invitee_uri?: string | null };

export const DEFAULT_GOALS = { attendance: 70, approval: 30, compliance: 90 } as const;
export type Goals = { attendance: number; approval: number; compliance: number };

export const APPROVED_RESULT = "Approved for last step";

/** Latest appointment that still represents a booking (reschedules are superseded rows). */
export function pickAppointment<T extends ApptLite>(appts: T[]): T | null {
  const live = appts.filter((a) => a.status !== "Rescheduled");
  const sorted = [...live].sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
  return sorted.find((a) => a.status !== "Canceled") ?? sorted[0] ?? null;
}

export type InterviewSource = "Calendly" | "Manual with appointment" | "Manual";

export function interviewSource(appt: ApptLite | null): InterviewSource {
  if (!appt) return "Manual";
  return appt.calendly_invitee_uri ? "Calendly" : "Manual with appointment";
}

export function isNoShow(status?: string | null) {
  return /no[\s-]?show/i.test(status ?? "");
}

/** Connected = an evaluation was started and the appointment was not marked No Show. */
export function attended(hasEvaluation: boolean, appt: ApptLite | null) {
  return hasEvaluation && !isNoShow(appt?.status);
}

/** Scheduled = has a live (non-canceled) appointment. */
export function isScheduled(appt: ApptLite | null) {
  return Boolean(appt && appt.status !== "Canceled");
}

export function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

export function goalTone(value: number, goal: number): "good" | "warn" | "bad" {
  if (value >= goal) return "good";
  if (value >= goal * 0.8) return "warn";
  return "bad";
}

export function experienceProfile(teaching: boolean, callcenter: boolean) {
  if (teaching && callcenter) return "Teaching + call center";
  if (teaching) return "Teaching only";
  if (callcenter) return "Call center only";
  return "No experience";
}

export function scoreBand(score: number | null) {
  if (score === null || score === undefined || score === 0) return "Pending";
  if (score >= 90) return "90–100";
  if (score >= 80) return "80–89";
  if (score >= 70) return "70–79";
  return "Below 70";
}

/* ---------- Recruitment → Training metrics (v2) ---------- */

export const LOBS = ["ONLINE", "EL SALVADOR", "NICARAGUA", "GUATEMALA"] as const;

/** Business LOB comes from modality first; the candidate's country is a separate field. */
export function lobOf(modality: string | null | undefined, countryCode: string | null | undefined) {
  if ((modality ?? "").toLowerCase() === "online") return "ONLINE";
  return ({ SV: "EL SALVADOR", NI: "NICARAGUA", GT: "GUATEMALA" } as Record<string, string>)[countryCode ?? ""] ?? "Sin registrar";
}

export type Ratio = { num: number; den: number; pct: number | null };
export function ratio(num: number, den: number): Ratio {
  return { num, den, pct: den ? Math.round((num / den) * 100) : null };
}
export function ratioLabel(r: Ratio, unit = "") {
  return r.pct === null ? "— / Sin base" : `${r.num} de ${r.den}${unit ? ` ${unit}` : ""} = ${r.pct}%`;
}

/**
 * Connection base: a live appointment whose time already passed (future, canceled and
 * superseded reschedules excluded). Manual interviews without appointment count once evaluated.
 */
export function connectionEligible(appt: ApptLite | null, hasEvaluation: boolean, now: Date) {
  if (!appt) return hasEvaluation;
  if (appt.status === "Canceled" || appt.status === "Rescheduled") return false;
  return new Date(appt.starts_at).getTime() <= now.getTime();
}

export type RecruitmentDecision = "Aprobado" | "No aprobado" | "Retake" | "Pendiente";
export function recruitmentDecision(finalResult: string | null | undefined, finished: boolean): RecruitmentDecision {
  if (!finished) return "Pendiente";
  if (finalResult === APPROVED_RESULT) return "Aprobado";
  if (finalResult === "Not approved") return "No aprobado";
  if (finalResult === "Retake required") return "Retake";
  return "Pendiente";
}
/** Closed decisions are the denominator; pending never lowers the rate. */
export const isClosedRecruitment = (d: RecruitmentDecision) => d !== "Pendiente";

export type ManagerDecision = "Aprobado" | "No aprobado" | "Retake" | "No show" | "Pendiente";
export function managerDecision(finalDecision: string | null | undefined, submitted: boolean): ManagerDecision {
  if (!submitted) return "Pendiente";
  const d = finalDecision ?? "";
  if (d.startsWith("Approved")) return "Aprobado";
  if (d.startsWith("Not Approved")) return "No aprobado";
  if (d === "Retake") return "Retake";
  if (/no show/i.test(d)) return "No show";
  return "Pendiente";
}
export const isClosedManager = (d: ManagerDecision) => d === "Aprobado" || d === "No aprobado" || d === "Retake";

export type PendingBucket = "Sin manager asignado" | "Pendiente de agendar" | "Agendado" | "Realizado, pendiente de decisión";
export function pendingSecondFilterBucket(p: { managerId: string | null; appointmentAt: string | null; started: boolean }): PendingBucket {
  if (!p.managerId) return "Sin manager asignado";
  if (p.started) return "Realizado, pendiente de decisión";
  if (p.appointmentAt) return "Agendado";
  return "Pendiente de agendar";
}

export type TrainingBucket =
  | "No reclutado" | "Cancelado antes de iniciar" | "Pendiente de iniciar" | "Activo"
  | "No show" | "Dropout" | "Completó" | "Sin registrar";
export type TrainingLite = {
  status: string | null; incorporationConfirmed: boolean; canceledBeforeStart: boolean;
  waveStart: string | null; startedAt: string | null;
};
/** Recruited = confirmed incorporation + cohort. A training no-show is never a dropout. */
export function trainingBucket(t: TrainingLite, today: string): TrainingBucket {
  if (t.canceledBeforeStart || t.status === "DROP OUT BEFORE TRAINING") return "Cancelado antes de iniciar";
  if (!t.incorporationConfirmed || !t.waveStart) return "No reclutado";
  if (t.status === "NO SHOW") return "No show";
  if (t.status === "DROP OUT DURING TRAINING") return "Dropout";
  if (t.status === "CERTIFIED" || t.status === "NOT CERTIFIED") return "Completó";
  if (t.status === "IN TRAINING" || t.startedAt) return "Activo";
  if (t.waveStart > today) return "Pendiente de iniciar";
  return "Sin registrar";
}
export const trainingStarted = (b: TrainingBucket) => b === "Activo" || b === "Dropout" || b === "Completó";
/** Expected to start: confirmed, start date reached, not canceled. */
export const trainingExpected = (b: TrainingBucket) =>
  trainingStarted(b) || b === "No show" || b === "Sin registrar";
