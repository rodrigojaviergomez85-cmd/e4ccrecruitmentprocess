import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLockedStatus } from "./evaluations";
import { AGREEMENT_KEYS, TRAINING_KEYS, normalizeModality } from "./manager-scorecard";
import { staffTier } from "./roles";
import {
  connectionEligible,
  interviewSource,
  isNoShow,
  lobOf,
  managerDecision,
  pickAppointment,
  recruitmentDecision,
  type ApptLite,
  type InterviewSource,
  type ManagerDecision,
  type RecruitmentDecision,
} from "./scorecard-metrics";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export type MetricRow = {
  applicationId: string;
  candidate: string;
  email: string;
  country: string;
  countryCode: string | null;
  lob: string;
  branch: string;
  applicationStatus: string;
  // interview
  source: InterviewSource;
  appointmentAt: string | null;
  appointmentStatus: string | null;
  interviewDate: string | null;
  hasAppointment: boolean;
  future: boolean;
  eligible: boolean;
  connected: boolean;
  completed: boolean;
  noShow: boolean;
  recruiterId: string | null;
  recruiter: string;
  recruitment: RecruitmentDecision;
  recruitmentDecidedAt: string | null;
  // second filter
  sentToSecondFilter: boolean;
  managerId: string | null;
  manager: string;
  managerAppointmentAt: string | null;
  managerStarted: boolean;
  managerDecision: ManagerDecision;
  managerDecidedAt: string | null;
  lastContactAt: string | null;
  // training
  training: {
    status: string | null;
    incorporationConfirmed: boolean;
    canceledBeforeStart: boolean;
    waveStart: string | null;
    startedAt: string | null;
    outcomeAt: string | null;
    outcomeReason: string;
    cohortChanges: number;
  } | null;
};

const SELECT =
  "id, full_name, email, country, country_code, city, city_other, status, assigned_manager_id, last_contact_at, archived_at, cities(name), recruitment_progress(work_modality), appointments(starts_at, status, calendly_invitee_uri), interview_evaluations(attempt_number, status, final_result, evaluator_id, interview_date, started_at, submitted_at, decided_at, sections), manager_evaluations(attempt_number, status, final_decision, manager_id, evaluator_id, decided_by, decided_at, submitted_at, appointment_at, timer_started_at, evidence), training_roster(status, incorporation_confirmed, canceled_before_start, wave_start, started_at, outcome_at, outcome_reason)";

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Reads every row of a single-column query in pages of 1000 (no silent caps). */
async function allIds(db: Db, table: "appointments" | "interview_evaluations" | "manager_evaluations") {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("application_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r) => r.application_id));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const getRecruitmentMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [{ data: roles }, { data: profile }, { data: countries }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", context.userId),
      db.from("staff_profiles").select("active").eq("user_id", context.userId).maybeSingle(),
      db.from("staff_countries").select("country_code").eq("user_id", context.userId),
    ]);
    const roleNames = (roles ?? []).map((r) => r.role as string);
    if (!staffTier(roleNames).isStaff) throw new Error("You do not have staff access.");
    if (profile && profile.active === false) throw new Error("Your account is deactivated.");
    const allowed = roleNames.includes("admin") ? null : (countries ?? []).map((c) => c.country_code);

    const [a, b, c, staffRes, changesRes] = await Promise.all([
      allIds(db, "appointments"),
      allIds(db, "interview_evaluations"),
      allIds(db, "manager_evaluations"),
      db.from("staff_profiles").select("user_id, full_name, email"),
      db.from("training_cohort_changes").select("application_id"),
    ]);
    const staff = new Map((staffRes.data ?? []).map((s) => [s.user_id, s.full_name || s.email]));
    const changes = new Map<string, number>();
    for (const ch of changesRes.data ?? []) changes.set(ch.application_id, (changes.get(ch.application_id) ?? 0) + 1);
    const ids = Array.from(new Set([...a, ...b, ...c]));

    const apps: any[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
    for (let i = 0; i < chunks.length; i += 6) {
      const res = await Promise.all(chunks.slice(i, i + 6).map((ch) => db.from("applications").select(SELECT).in("id", ch)));
      for (const r of res) {
        if (r.error) throw new Error(r.error.message);
        apps.push(...(r.data ?? []));
      }
    }

    const now = new Date();
    const latest = <T extends { attempt_number?: number | null }>(list: T[] | null | undefined) =>
      [...(list ?? [])].sort((x, y) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0))[0] ?? null;

    const rows: MetricRow[] = apps
      .filter((app) => !allowed || !app.country_code || allowed.includes(app.country_code))
      .map((app) => {
        const appt = pickAppointment((app.appointments ?? []) as ApptLite[]);
        const ev = latest<any>(app.interview_evaluations);
        const mgr = latest<any>(app.manager_evaluations);
        const tr = one<any>(app.training_roster);
        const evidence = (mgr?.evidence ?? {}) as Record<string, string>;
        const sections = (ev?.sections ?? {}) as Record<string, Record<string, unknown>>;
        const modality =
          normalizeModality(evidence[AGREEMENT_KEYS.modality]) ??
          normalizeModality(String(sections["candidate"]?.["lob"] ?? "")) ??
          normalizeModality(one<any>(app.recruitment_progress)?.work_modality);
        const finished = isLockedStatus(ev?.status);
        const rec = recruitmentDecision(ev?.final_result, finished);
        const mgrSubmitted = Boolean(mgr?.submitted_at);
        const mgrDecision = managerDecision(mgr?.final_decision, mgrSubmitted);
        // Attribution: whoever actually decided, otherwise the assigned manager.
        const managerId = mgr?.decided_by ?? mgr?.manager_id ?? app.assigned_manager_id ?? null;
        const recruiterId = ev?.evaluator_id ?? null;
        const live = appt && appt.status !== "Canceled";
        return {
          applicationId: app.id,
          candidate: app.full_name,
          email: app.email,
          country: app.country || "Sin registrar",
          countryCode: app.country_code,
          lob: lobOf(modality, app.country_code),
          branch: (evidence[TRAINING_KEYS.branch] || "").trim() || app.cities?.name || app.city_other || app.city || "Sin registrar",
          applicationStatus: String(app.status ?? ""),
          source: interviewSource(appt),
          appointmentAt: appt?.starts_at ?? null,
          appointmentStatus: appt?.status ?? null,
          interviewDate: appt?.starts_at?.slice(0, 10) ?? ev?.interview_date ?? ev?.started_at?.slice(0, 10) ?? null,
          hasAppointment: Boolean(live),
          future: Boolean(live && new Date(appt!.starts_at) > now),
          eligible: connectionEligible(appt, Boolean(ev), now),
          connected: Boolean(ev) && !isNoShow(appt?.status),
          completed: finished,
          noShow: isNoShow(appt?.status),
          recruiterId,
          recruiter: recruiterId ? (staff.get(recruiterId) ?? "Sin registrar") : "Sin registrar",
          recruitment: rec,
          recruitmentDecidedAt: ev?.decided_at ?? ev?.submitted_at ?? null,
          sentToSecondFilter: rec === "Aprobado",
          managerId,
          manager: managerId ? (staff.get(managerId) ?? "Sin registrar") : "Sin manager",
          managerAppointmentAt: mgr?.appointment_at ?? null,
          managerStarted: Boolean(mgr?.timer_started_at),
          managerDecision: mgrDecision,
          managerDecidedAt: mgr?.decided_at ?? mgr?.submitted_at ?? null,
          lastContactAt: app.last_contact_at ?? null,
          training: tr
            ? {
                status: tr.status,
                incorporationConfirmed: Boolean(tr.incorporation_confirmed),
                canceledBeforeStart: Boolean(tr.canceled_before_start),
                waveStart: tr.wave_start,
                startedAt: tr.started_at,
                outcomeAt: tr.outcome_at,
                outcomeReason: tr.outcome_reason ?? "",
                cohortChanges: changes.get(app.id) ?? 0,
              }
            : null,
        };
      });

    return { rows, generatedAt: now.toISOString() };
  });
