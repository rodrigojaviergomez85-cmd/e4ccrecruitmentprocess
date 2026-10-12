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
