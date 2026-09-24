import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLockedStatus, levelDifference } from "./evaluations";
import { staffTier } from "./roles";

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
  evaluationStatus: string;
  finalResult: string | null;
  rejectionReasons: string[];
  previousCefr: string | null;
  liveCefr: string | null;
  levelDelta: number | null;
  totalScore: number | null;
  complianceScore: number | null;
  grammarTestScore: number | null;
  teachingExperience: boolean;
  callcenterExperience: boolean;
  equipmentOk: boolean | null;
  grammarTestCompleted: boolean;
  submittedOnInterviewDate: boolean;
  completionMinutes: number | null;
};

async function buildRows(userId: string, data: z.infer<typeof filters>) {
  const { db, allowedCountries } = await staffCtx(userId);

  let appQuery = db
    .from("applications")
    .select(
      "id, full_name, email, country, country_code, city, city_other, teaching_experience, callcenter_experience, cities(name), ai_evaluations(cefr), appointments(id, starts_at, status), recruitment_progress(work_modality, grammar_test_score, grammar_test_status), interview_evaluations(*)",
    )
    .not("submitted_at", "is", null)
    .limit(1000);
  if (allowedCountries) {
    if (!allowedCountries.length) return { rows: [] as ScorecardRow[], evaluators: [] };
    appQuery = appQuery.in("country_code", allowedCountries);
  }
  if (data.country) appQuery = appQuery.eq("country_code", data.country);

  const [{ data: apps, error }, { data: staff }] = await Promise.all([
    appQuery,
    db.from("staff_profiles").select("user_id, full_name, email"),
  ]);
  if (error) throw new Error(error.message);
  const staffById = new Map((staff ?? []).map((s) => [s.user_id, s.full_name || s.email]));

  const rows: ScorecardRow[] = (apps ?? []).map((a) => {
    const appt = (a.appointments ?? [])
      .filter((x) => x.status !== "Rescheduled" && x.status !== "Canceled")
      .sort((x, y) => (x.starts_at < y.starts_at ? 1 : -1))[0];
    const ev = (a.interview_evaluations ?? [])[0];
    const progress = one(a.recruitment_progress);
    const sections = (ev?.sections ?? {}) as Record<string, Record<string, unknown>>;
    const previousCefr = one(a.ai_evaluations)?.cefr ?? null;
    const liveCefr = ev?.live_cefr ?? null;
    const submittedAt = ev?.submitted_at ?? null;
    const interviewDate = ev?.interview_date ?? (appt?.starts_at ? appt.starts_at.slice(0, 10) : null);
    return {
      applicationId: a.id,
      candidate: a.full_name,
      email: a.email,
      country: a.country,
      city: a.cities?.name ?? a.city_other ?? a.city,
      lob: String(sections["candidate"]?.["lob"] ?? progress?.work_modality ?? ""),
      referral: String(sections["candidate"]?.["referral_source"] ?? ""),
      evaluator: ev?.evaluator_id ? (staffById.get(ev.evaluator_id) ?? "") : "",
      evaluatorId: ev?.evaluator_id ?? null,
      interviewDate,
      appointmentAt: appt?.starts_at ?? null,
      evaluationStatus: (ev?.status as string) ?? "Not started",
      finalResult: ev?.final_result ?? null,
      rejectionReasons: (ev?.not_approved_reasons as string[] | null) ?? [],
      previousCefr,
      liveCefr,
      levelDelta: levelDifference(previousCefr, liveCefr),
      totalScore: ev?.total_score ?? null,
      complianceScore: ev?.compliance_score ?? null,
      grammarTestScore: progress?.grammar_test_score ?? null,
      teachingExperience: a.teaching_experience !== "None",
      callcenterExperience: Boolean(a.callcenter_experience),
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
              Math.round(
                (new Date(submittedAt).getTime() - new Date(ev.started_at).getTime()) / 60000,
              ),
            )
          : null,
    };
  });

  const ref = (r: ScorecardRow) => r.appointmentAt ?? (r.interviewDate ? `${r.interviewDate}T00:00:00Z` : null);
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

const avg = (values: Array<number | null>) => {
  const nums = values.filter((v): v is number => typeof v === "number");
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
};

export const getScorecard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filters.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { rows, evaluators } = await buildRows(context.userId, data);

    const scheduled = rows.filter((r) => r.appointmentAt).length;
    const completed = rows.filter((r) => isLockedStatus(r.evaluationStatus)).length;
    const approved = rows.filter((r) => r.finalResult === "Approved for last step").length;
    const retakes = rows.filter((r) => r.finalResult === "Retake required").length;
    const notApproved = rows.filter((r) => r.finalResult === "Not approved").length;
    const online = rows.filter((r) => r.lob === "online");

    const group = (key: (r: ScorecardRow) => string) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const k = key(r) || "—";
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };

    const byWeek = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const r of rows) {
      const iso = r.appointmentAt ?? (r.interviewDate ? `${r.interviewDate}T00:00:00Z` : null);
      if (!iso) continue;
      const d = new Date(iso);
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const wk = monday.toISOString().slice(0, 10);
      const mo = iso.slice(0, 7);
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
      byMonth.set(mo, (byMonth.get(mo) ?? 0) + 1);
    }

    const rejectionCounts = new Map<string, number>();
    for (const r of rows) for (const reason of r.rejectionReasons)
      rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);

    const evaluatorRows = evaluators
      .map((e) => {
        const mine = rows.filter((r) => r.evaluatorId === e.id);
        const done = mine.filter((r) => isLockedStatus(r.evaluationStatus));
        return {
          evaluator: e.name,
          assigned: mine.length,
          completed: done.length,
          onInterviewDate: done.filter((r) => r.submittedOnInterviewDate).length,
          avgCompletionMinutes: avg(done.map((r) => r.completionMinutes)),
          avgCompliance: avg(done.map((r) => r.complianceScore)),
          missingDocumentation: done.filter((r) => (r.complianceScore ?? 0) < 100).length,
          approved: mine.filter((r) => r.finalResult === "Approved for last step").length,
          retake: mine.filter((r) => r.finalResult === "Retake required").length,
          notApproved: mine.filter((r) => r.finalResult === "Not approved").length,
        };
      })
      .filter((e) => e.assigned > 0);

    return {
      summary: {
        scheduled,
        completed,
        completionRate: scheduled ? Math.round((completed / scheduled) * 100) : 0,
        approved,
        retakes,
        notApproved,
        approvalRate: completed ? Math.round((approved / completed) * 100) : 0,
        avgScore: avg(rows.map((r) => r.totalScore)),
        avgCompliance: avg(rows.map((r) => r.complianceScore)),
        avgGrammarTest: avg(rows.map((r) => r.grammarTestScore)),
        pendingFinalInterview: rows.filter(
          (r) => r.finalResult === "Approved for last step" && isLockedStatus(r.evaluationStatus),
        ).length,
        pendingRetake: retakes,
        teachingExperienceRate: rows.length
          ? Math.round((rows.filter((r) => r.teachingExperience).length / rows.length) * 100)
          : 0,
        callcenterExperienceRate: rows.length
          ? Math.round((rows.filter((r) => r.callcenterExperience).length / rows.length) * 100)
          : 0,
        equipmentComplianceRate: online.length
          ? Math.round((online.filter((r) => r.equipmentOk).length / online.length) * 100)
          : 0,
        grammarTestCompletionRate: rows.length
          ? Math.round((rows.filter((r) => r.grammarTestCompleted).length / rows.length) * 100)
          : 0,
      },
      charts: {
        byWeek: Array.from(byWeek, ([label, value]) => ({ label, value })).sort((a, b) =>
          a.label < b.label ? -1 : 1,
        ),
        byMonth: Array.from(byMonth, ([label, value]) => ({ label, value })).sort((a, b) =>
          a.label < b.label ? -1 : 1,
        ),
        byEvaluator: group((r) => r.evaluator),
        byCountry: group((r) => r.country),
        byCity: group((r) => r.city),
        byLob: group((r) => r.lob),
        byLiveLevel: group((r) => r.liveCefr ?? ""),
        byReferral: group((r) => r.referral),
        levelComparison: rows
          .filter((r) => r.liveCefr)
          .map((r) => ({
            candidate: r.candidate,
            previous: r.previousCefr ?? "—",
            live: r.liveCefr ?? "—",
            delta: r.levelDelta,
          })),
        topRejectionReasons: Array.from(rejectionCounts, ([label, value]) => ({ label, value })).sort(
          (a, b) => b.value - a.value,
        ),
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
