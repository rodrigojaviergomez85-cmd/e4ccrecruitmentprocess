import { creditedRecruiterId } from "./recruiter-quota";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLockedStatus, levelDifference } from "./evaluations";
import { staffTier } from "./roles";
import {
  APPROVED_RESULT,
  DEFAULT_GOALS,
  attended,
  experienceProfile,
  interviewSource,
  isNoShow,
  isScheduled,
  pct,
  pickAppointment,
  scoreBand,
  type ApptLite,
  type Goals,
  type InterviewSource,
} from "./scorecard-metrics";

/** Embedded Supabase relations arrive as a row or an array depending on the relationship. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function staffCtx(userId: string) {
  const db = await getAdmin();
  const [{ data: roles }, { data: profile }, { data: countries }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active").eq("user_id", userId).maybeSingle(),
    db.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  if (!staffTier(roleNames).isStaff) throw new Error("You do not have staff access.");
  if (profile && profile.active === false) throw new Error("Your account is deactivated.");
  const isAdmin = roleNames.includes("admin");
  return {
    db,
    isAdmin,
    allowedCountries: isAdmin ? null : (countries ?? []).map((c) => c.country_code),
  };
}

const filters = z
  .object({
    from: z.string().max(30).optional(),
    to: z.string().max(30).optional(),
    evaluator: z.string().max(60).optional(),
    country: z.string().max(8).optional(),
    city: z.string().max(80).optional(),
    lob: z.string().max(20).optional(),
    referral: z.string().max(80).optional(),
    englishLevel: z.string().max(10).optional(),
    finalResult: z.string().max(40).optional(),
    rejectionReason: z.string().max(80).optional(),
  })
  .default({});

export type ScorecardRow = {
  applicationId: string;
  candidate: string;
  email: string;
  country: string;
  city: string;
  lob: string;
  referral: string;
  evaluator: string;
  evaluatorId: string | null;
  interviewDate: string | null;
  appointmentAt: string | null;
  appointmentStatus: string | null;
  source: InterviewSource;
  scheduled: boolean;
  attended: boolean;
  noShow: boolean;
  canceled: boolean;
  waitingList: boolean;
  applicationStatus: string;
  managerDecision: string | null;
  evaluationStatus: string;
  finalResult: string | null;
  rejectionReasons: string[];
  previousCefr: string | null;
  liveCefr: string | null;
  levelDelta: number | null;
  totalScore: number | null;
  complianceScore: number | null;
  grammarTestScore: number | null;
  handleSeconds: number | null;
  teachingExperience: boolean;
  callcenterExperience: boolean;
  taughtChildren: boolean | null;
  equipmentOk: boolean | null;
  grammarTestCompleted: boolean;
  submittedOnInterviewDate: boolean;
  completionMinutes: number | null;
};

const APP_SELECT =
  "id, full_name, email, country, country_code, city, city_other, status, teaching_experience, taught_children, callcenter_experience, archived_at, cities(name), ai_evaluations(cefr), appointments(id, starts_at, status, calendly_invitee_uri), recruitment_progress(work_modality, grammar_test_score, grammar_test_status), interview_evaluations(*), manager_evaluations(final_decision, attempt_number, decided_at)";

async function buildRows(userId: string, data: z.infer<typeof filters>) {
  const { db, allowedCountries } = await staffCtx(userId);
  if (allowedCountries && !allowedCountries.length) return { rows: [] as ScorecardRow[], evaluators: [] };

  // Every application with an interview: a booked appointment or an evaluation (manual included).
  let apptIdsQuery = db.from("appointments").select("application_id").neq("status", "Rescheduled").limit(10000);
  if (data.from) apptIdsQuery = apptIdsQuery.gte("starts_at", `${data.from}T00:00:00Z`);
  if (data.to) apptIdsQuery = apptIdsQuery.lte("starts_at", `${data.to}T23:59:59Z`);
  const [{ data: apptIds, error: e1 }, { data: evIds, error: e2 }, { data: staff }] = await Promise.all([
    apptIdsQuery,
    db.from("interview_evaluations").select("application_id").limit(10000),
    db.from("staff_profiles").select("user_id, full_name, email"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const ids = Array.from(new Set([...(apptIds ?? []), ...(evIds ?? [])].map((r) => r.application_id)));

  const apps: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    let q = db.from("applications").select(APP_SELECT).in("id", ids.slice(i, i + 150));
    if (data.country) q = q.eq("country_code", data.country);
    const { data: chunk, error } = await q;
    if (error) throw new Error(error.message);
    apps.push(...(chunk ?? []));
  }
  const staffById = new Map((staff ?? []).map((s) => [s.user_id, s.full_name || s.email]));

  const rows: ScorecardRow[] = apps
    .filter((a) => !allowedCountries || !a.country_code || allowedCountries.includes(a.country_code))
    .map((a) => {
      const appt = pickAppointment((a.appointments ?? []) as ApptLite[]) as
        | (ApptLite & { id: string })
        | null;
      const ev = [...(a.interview_evaluations ?? [])].sort(
        (x: any, y: any) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0),
      )[0];
      const mgr = [...(a.manager_evaluations ?? [])].sort(
        (x: any, y: any) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0),
      )[0];
      const progress = one(a.recruitment_progress) as any;
      const sections = (ev?.sections ?? {}) as Record<string, Record<string, unknown>>;
      const previousCefr = (one(a.ai_evaluations) as any)?.cefr ?? null;
      const liveCefr = ev?.live_cefr ?? null;
      const submittedAt = ev?.submitted_at ?? null;
      const interviewDate =
        ev?.interview_date ??
        (appt?.starts_at ? appt.starts_at.slice(0, 10) : ev?.started_at ? ev.started_at.slice(0, 10) : null);
      const appStatus = String(a.status ?? "");
      return {
        applicationId: a.id,
        candidate: a.full_name,
        email: a.email,
        country: a.country || "No country",
        city: a.cities?.name ?? a.city_other ?? a.city ?? "",
        lob: String(sections["candidate"]?.["lob"] ?? progress?.work_modality ?? ""),
        referral: String(sections["candidate"]?.["referral_source"] ?? ""),
        evaluator: creditedRecruiterId(ev) ? (staffById.get(creditedRecruiterId(ev)!) ?? "") : "",
        evaluatorId: creditedRecruiterId(ev),
        interviewDate,
        appointmentAt: appt?.starts_at ?? null,
        appointmentStatus: appt?.status ?? null,
        source: interviewSource(appt),
        scheduled: isScheduled(appt),
        attended: attended(Boolean(ev), appt),
        noShow: isNoShow(appt?.status),
        canceled: appt?.status === "Canceled" && !ev,
        waitingList: appStatus === "Waiting List",
        applicationStatus: appStatus,
        managerDecision: mgr?.final_decision ?? null,
        evaluationStatus: (ev?.status as string) ?? "Not started",
        finalResult: ev?.final_result ?? null,
        rejectionReasons: (ev?.not_approved_reasons as string[] | null) ?? [],
        previousCefr,
        liveCefr,
        levelDelta: levelDifference(previousCefr, liveCefr),
        totalScore: ev?.total_score || null,
        complianceScore: ev?.compliance_score ?? null,
        grammarTestScore: progress?.grammar_test_score ?? null,
        handleSeconds: ev?.handle_seconds ?? null,
        teachingExperience: Boolean(a.teaching_experience) && a.teaching_experience !== "None",
        callcenterExperience: Boolean(a.callcenter_experience),
        taughtChildren: a.taught_children ?? null,
        equipmentOk:
          sections["equipment"]?.["meets_requirements"] === undefined
            ? null
            : String(sections["equipment"]?.["meets_requirements"]) === "Yes",
        grammarTestCompleted: String(sections["grammar_test"]?.["completed"] ?? "") === "Yes",
        submittedOnInterviewDate: Boolean(
          submittedAt && interviewDate && submittedAt.slice(0, 10) === interviewDate,
        ),
        completionMinutes:
          ev?.started_at && submittedAt
            ? Math.max(
                0,
                Math.round((new Date(submittedAt).getTime() - new Date(ev.started_at).getTime()) / 60000),
              )
            : null,
      };
    });

  const ref = (r: ScorecardRow) => r.appointmentAt ?? (r.interviewDate ? `${r.interviewDate}T12:00:00Z` : null);
  const filtered = rows.filter((r) => {
    if (data.from && (!ref(r) || ref(r)! < data.from)) return false;
    if (data.to && (!ref(r) || ref(r)! > `${data.to}T23:59:59Z`)) return false;
    if (data.evaluator && r.evaluatorId !== data.evaluator) return false;
    if (data.city && r.city !== data.city) return false;
    if (data.lob && r.lob !== data.lob) return false;
    if (data.referral && r.referral !== data.referral) return false;
    if (data.englishLevel && r.liveCefr !== data.englishLevel) return false;
    if (data.finalResult && r.finalResult !== data.finalResult) return false;
    if (data.rejectionReason && !r.rejectionReasons.includes(data.rejectionReason)) return false;
    return true;
  });

  return {
    rows: filtered,
    evaluators: (staff ?? []).map((s) => ({ id: s.user_id, name: s.full_name || s.email })),
  };
}

async function readGoals(db: Awaited<ReturnType<typeof getAdmin>>): Promise<Goals> {
  const { data } = await db.from("scorecard_weights").select("thresholds").eq("id", true).maybeSingle();
  const t = (data?.thresholds ?? {}) as Record<string, number>;
  return {
    attendance: t["goal_attendance"] ?? DEFAULT_GOALS.attendance,
    approval: t["goal_approval"] ?? DEFAULT_GOALS.approval,
    compliance: t["goal_compliance"] ?? DEFAULT_GOALS.compliance,
  };
}

export const updateScorecardGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        attendance: z.number().min(0).max(100),
        approval: z.number().min(0).max(100),
        compliance: z.number().min(0).max(100),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, isAdmin } = await staffCtx(context.userId);
    if (!isAdmin) throw new Error("Admin access required.");
    const { data: row } = await db.from("scorecard_weights").select("thresholds").eq("id", true).maybeSingle();
    const thresholds = {
      ...((row?.thresholds ?? {}) as Record<string, number>),
      goal_attendance: data.attendance,
      goal_approval: data.approval,
      goal_compliance: data.compliance,
    };
    const { error } = await db
      .from("scorecard_weights")
      .update({ thresholds: thresholds as never, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const avg = (values: Array<number | null>) => {
  const nums = values.filter((v): v is number => typeof v === "number");
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
};

type Rate = { label: string; total: number; completed: number; approved: number; rate: number };

export const getScorecard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filters.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { rows, evaluators } = await buildRows(context.userId, data);
    const goals = await readGoals(await getAdmin());

    const done = (r: ScorecardRow) => isLockedStatus(r.evaluationStatus);
    const isApproved = (r: ScorecardRow) => r.finalResult === APPROVED_RESULT;
    const scheduled = rows.filter((r) => r.scheduled).length;
    const scheduledAttended = rows.filter((r) => r.scheduled && r.attended).length;
    const connected = rows.filter((r) => r.attended).length;
    const completedRows = rows.filter(done);
    const completed = completedRows.length;
    const approvedRows = rows.filter(isApproved);
    const approved = approvedRows.length;
    const retakes = rows.filter((r) => r.finalResult === "Retake required").length;
    const notApproved = rows.filter((r) => r.finalResult === "Not approved").length;
    const managerApproved = rows.filter((r) => (r.managerDecision ?? "").startsWith("Approved")).length;
    const training = rows.filter((r) => r.applicationStatus.startsWith("Approved for Training")).length;
    const online = rows.filter((r) => r.lob === "online");

    const group = (list: ScorecardRow[], key: (r: ScorecardRow) => string) => {
      const map = new Map<string, number>();
      for (const r of list) {
        const k = key(r) || "—";
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const rateBy = (key: (r: ScorecardRow) => string): Rate[] => {
      const map = new Map<string, ScorecardRow[]>();
      for (const r of rows) {
        const k = key(r) || "—";
        map.set(k, [...(map.get(k) ?? []), r]);
      }
      return Array.from(map, ([label, list]) => {
        const c = list.filter(done).length;
        const a = list.filter(isApproved).length;
        return { label, total: list.length, completed: c, approved: a, rate: pct(a, c) };
      }).sort((x, y) => y.total - x.total);
    };

    const weekOf = (r: ScorecardRow) => {
      const iso = r.appointmentAt ?? (r.interviewDate ? `${r.interviewDate}T12:00:00Z` : null);
      if (!iso) return "";
      const d = new Date(iso);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const monthOf = (r: ScorecardRow) => (r.appointmentAt ?? r.interviewDate ?? "").slice(0, 7);

    const rejectionCounts = new Map<string, number>();
    for (const r of rows) for (const reason of r.rejectionReasons)
      rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);

    const evaluatorRows = evaluators
      .map((e) => {
        const mine = rows.filter((r) => r.evaluatorId === e.id);
        const fin = mine.filter(done);
        const sched = mine.filter((r) => r.scheduled);
        const ahts = fin.map((r) => r.handleSeconds).filter((v): v is number => typeof v === "number" && v > 0);
        const ap = mine.filter(isApproved).length;
        return {
          evaluator: e.name,
          assigned: mine.length,
          scheduled: sched.length,
          connected: mine.filter((r) => r.attended).length,
          attendanceRate: pct(sched.filter((r) => r.attended).length, sched.length),
          completed: fin.length,
          onInterviewDate: fin.filter((r) => r.submittedOnInterviewDate).length,
          avgCompletionMinutes: avg(fin.map((r) => r.completionMinutes)),
          avgAhtSeconds: ahts.length ? Math.round(ahts.reduce((a, b) => a + b, 0) / ahts.length) : 0,
          avgScore: avg(fin.map((r) => r.totalScore)),
          avgCompliance: avg(fin.map((r) => r.complianceScore)),
          missingDocumentation: fin.filter((r) => (r.complianceScore ?? 0) < 100).length,
          approved: ap,
          approvalRate: pct(ap, fin.length),
          retake: mine.filter((r) => r.finalResult === "Retake required").length,
          notApproved: mine.filter((r) => r.finalResult === "Not approved").length,
        };
      })
      .filter((e) => e.assigned > 0)
      .sort((a, b) => b.completed - a.completed);

    return {
      goals,
      summary: {
        total: rows.length,
        scheduled,
        connected,
        attendanceRate: pct(scheduledAttended, scheduled),
        noShows: rows.filter((r) => r.noShow).length,
        waitingList: rows.filter((r) => r.waitingList).length,
        canceled: rows.filter((r) => r.canceled).length,
        calendly: rows.filter((r) => r.source === "Calendly").length,
        manual: rows.filter((r) => r.source !== "Calendly").length,
        completed,
        completionRate: pct(completed, connected),
        approved,
        retakes,
        notApproved,
        approvalRate: pct(approved, completed),
        retakeRate: pct(retakes, completed),
        notApprovedRate: pct(notApproved, completed),
        managerApproved,
        training,
        avgScore: avg(rows.map((r) => r.totalScore)),
        avgCompliance: avg(rows.map((r) => r.complianceScore)),
        avgGrammarTest: avg(rows.map((r) => r.grammarTestScore)),
        pendingFinalInterview: rows.filter((r) => isApproved(r) && done(r) && !r.managerDecision).length,
        pendingRetake: retakes,
        teachingExperienceRate: pct(rows.filter((r) => r.teachingExperience).length, rows.length),
        callcenterExperienceRate: pct(rows.filter((r) => r.callcenterExperience).length, rows.length),
        equipmentComplianceRate: pct(online.filter((r) => r.equipmentOk).length, online.length),
        grammarTestCompletionRate: pct(rows.filter((r) => r.grammarTestCompleted).length, rows.length),
      },
      funnel: [
        { label: "Scheduled", value: scheduled },
        { label: "Connected", value: connected },
        { label: "Interview finished", value: completed },
        { label: "Approved in Recruitment", value: approved },
        { label: "Approved by Manager", value: managerApproved },
        { label: "Approved for Training", value: training },
      ],
      approvalBy: {
        evaluator: rateBy((r) => r.evaluator),
        country: rateBy((r) => r.country),
        lob: rateBy((r) => r.lob),
        week: rateBy(weekOf).sort((a, b) => (a.label < b.label ? -1 : 1)),
        month: rateBy(monthOf).sort((a, b) => (a.label < b.label ? -1 : 1)),
      },
      approvedProfile: {
        lob: group(approvedRows, (r) => r.lob),
        country: group(approvedRows, (r) => r.country),
        level: group(approvedRows, (r) => r.liveCefr ?? ""),
        experience: group(approvedRows, (r) => experienceProfile(r.teachingExperience, r.callcenterExperience)),
        children: group(approvedRows, (r) => (r.taughtChildren === null ? "" : r.taughtChildren ? "Taught children" : "Has not taught children")),
        referral: group(approvedRows, (r) => r.referral),
        score: group(approvedRows, (r) => scoreBand(r.totalScore)),
      },
      charts: {
        bySource: group(rows, (r) => r.source),
        byLiveLevel: group(rows, (r) => r.liveCefr ?? ""),
        byReferral: group(rows, (r) => r.referral),
        byCity: group(rows, (r) => r.city),
        topRejectionReasons: Array.from(rejectionCounts, ([label, value]) => ({ label, value })).sort(
          (a, b) => b.value - a.value,
        ),
        levelComparison: rows
          .filter((r) => r.liveCefr)
          .map((r) => ({
            candidate: r.candidate,
            previous: r.previousCefr ?? "—",
            live: r.liveCefr ?? "—",
            delta: r.levelDelta,
          })),
      },
      evaluatorCompliance: evaluatorRows,
      evaluators,
      rowCount: rows.length,
    };
  });

const CSV_COLUMNS: Array<[string, (r: ScorecardRow) => string | number]> = [
  ["Candidate", (r) => r.candidate],
  ["Email", (r) => r.email],
  ["Country", (r) => r.country],
  ["City/Branch", (r) => r.city],
  ["LOB", (r) => r.lob],
  ["Referral source", (r) => r.referral],
  ["Evaluator", (r) => r.evaluator],
  ["Source", (r) => r.source],
  ["Appointment", (r) => r.appointmentAt ?? ""],
  ["Appointment status", (r) => r.appointmentStatus ?? ""],
  ["Connected", (r) => (r.attended ? "Yes" : "No")],
  ["Manager decision", (r) => r.managerDecision ?? ""],
  ["Candidate status", (r) => r.applicationStatus],
  ["Experience profile", (r) => experienceProfile(r.teachingExperience, r.callcenterExperience)],
  ["Taught children", (r) => (r.taughtChildren === null ? "" : r.taughtChildren ? "Yes" : "No")],
  ["AHT seconds", (r) => r.handleSeconds ?? ""],
  ["Interview date", (r) => r.interviewDate ?? ""],
  ["Evaluation status", (r) => r.evaluationStatus],
  ["Final result", (r) => r.finalResult ?? ""],
  ["Rejection reasons", (r) => r.rejectionReasons.join(" | ")],
  ["Previous English level", (r) => r.previousCefr ?? ""],
  ["Live English level", (r) => r.liveCefr ?? ""],
  ["Level difference", (r) => (r.levelDelta === null ? "" : r.levelDelta)],
  ["Total score", (r) => r.totalScore ?? ""],
  ["Compliance score", (r) => r.complianceScore ?? ""],
  ["Grammar test score", (r) => r.grammarTestScore ?? ""],
  ["Teaching experience", (r) => (r.teachingExperience ? "Yes" : "No")],
  ["Call center experience", (r) => (r.callcenterExperience ? "Yes" : "No")],
  ["Equipment OK", (r) => (r.equipmentOk === null ? "" : r.equipmentOk ? "Yes" : "No")],
  ["Submitted on interview date", (r) => (r.submittedOnInterviewDate ? "Yes" : "No")],
  ["Completion minutes", (r) => r.completionMinutes ?? ""],
];

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const exportScorecardCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filters.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { rows } = await buildRows(context.userId, data);
    const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(",")];
    for (const row of rows) {
      lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(","));
    }
    return { csv: lines.join("\n"), count: rows.length };
  });
