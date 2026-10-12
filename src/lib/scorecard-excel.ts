/** Builds the ordered Excel metrics workbook for the Recruitment Scorecard (client-side, SheetJS). */
import * as XLSX from "xlsx";

import type { Goals } from "./scorecard-metrics";

type Rate = { label: string; total: number; completed: number; approved: number; rate: number };
type Group = { label: string; value: number };

export type ScorecardData = {
  goals: Goals;
  summary: {
    total: number;
    scheduled: number;
    connected: number;
    attendanceRate: number;
    noShows: number;
    waitingList: number;
    canceled: number;
    calendly: number;
    manual: number;
    completed: number;
    completionRate: number;
    approved: number;
    retakes: number;
    notApproved: number;
    approvalRate: number;
    retakeRate: number;
    notApprovedRate: number;
    managerApproved: number;
    training: number;
    avgScore: number;
    avgCompliance: number;
    avgGrammarTest: number;
    pendingFinalInterview: number;
    teachingExperienceRate: number;
    callcenterExperienceRate: number;
    equipmentComplianceRate: number;
    grammarTestCompletionRate: number;
  };
  funnel: Array<{ label: string; value: number }>;
  approvalBy: { evaluator: Rate[]; country: Rate[]; lob: Rate[]; week: Rate[]; month: Rate[] };
  approvedProfile: {
    lob: Group[];
    country: Group[];
    level: Group[];
    experience: Group[];
    children: Group[];
    referral: Group[];
    score: Group[];
  };
  charts: {
    bySource: Group[];
    byLiveLevel: Group[];
    byReferral: Group[];
    byCity: Group[];
    topRejectionReasons: Group[];
    levelComparison: Array<{ candidate: string; previous: string; live: string; delta: number | null }>;
  };
  evaluatorCompliance: Array<{
    evaluator: string;
    assigned: number;
    scheduled: number;
    connected: number;
    attendanceRate: number;
    completed: number;
    onInterviewDate: number;
    avgCompletionMinutes: number;
    avgAhtSeconds: number;
    avgScore: number;
    avgCompliance: number;
    missingDocumentation: number;
    approved: number;
    approvalRate: number;
    retake: number;
    notApproved: number;
  }>;
};

const PCT = '0"%"';

function fmtDuration(seconds: number) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function rateSection(title: string, rows: Rate[]): (string | number)[][] {
  const out: (string | number)[][] = [[title], ["Group", "Interviews", "Finished", "Approved", "Approval %"]];
  for (const r of rows) out.push([r.label, r.total, r.completed, r.approved, r.completed ? r.rate : "—"]);
  out.push([]);
  return out;
}

function groupSection(title: string, rows: Group[], valueHeader = "Count"): (string | number)[][] {
  const out: (string | number)[][] = [[title], ["Group", valueHeader]];
  for (const r of rows) out.push([r.label || "—", r.value]);
  out.push([]);
  return out;
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}

function applyPctFormat(ws: XLSX.WorkSheet, cols: number[], firstDataRow: number) {
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let row = firstDataRow; row <= range.e.r; row++) {
    for (const col of cols) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell && typeof cell.v === "number") cell.z = PCT;
    }
  }
}

export function buildScorecardWorkbook(
  data: ScorecardData,
  meta: { from: string; to: string },
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const s = data.summary;
  const rangeLabel = `${meta.from || "all"} – ${meta.to || "all"}`;

  // Sheet 1: Summary metrics.
  const summaryAoa: (string | number)[][] = [
    ["E4CC Recruitment Scorecard"],
    ["Date range", rangeLabel],
    ["Generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ["Interviews in range", s.total],
    [],
    ["Goals", "Attendance", "Approval", "Compliance"],
    ["Target", data.goals.attendance, data.goals.approval, data.goals.compliance],
    [],
    ["Interview metrics", "Value"],
    ["Total interviews", s.total],
    ["Scheduled", s.scheduled],
    ["Connected", s.connected],
    ["Attendance rate", s.attendanceRate],
    ["No Show", s.noShows],
    ["Waiting List", s.waitingList],
    ["Canceled", s.canceled],
    ["From Calendly", s.calendly],
    ["Manual", s.manual],
    [],
    ["Results", "Value"],
    ["Finished interviews", s.completed],
    ["Approved", s.approved],
    ["Approval rate", s.approvalRate],
    ["Retake", s.retakes],
    ["Retake rate", s.retakeRate],
    ["Not approved", s.notApproved],
    ["Not approved rate", s.notApprovedRate],
    ["Average compliance", s.avgCompliance],
    ["Average score", s.avgScore],
    ["Average Grammar Test", s.avgGrammarTest],
    ["Pending second filter", s.pendingFinalInterview],
    ["Approved by Manager", s.managerApproved],
    ["Approved for Training", s.training],
    [],
    ["Recruitment funnel", "Candidates", "% of previous"],
    ...data.funnel.map((f, i) => {
      const prev = i > 0 ? data.funnel[i - 1]?.value : undefined;
      return [
        f.label,
        f.value,
        prev ? `${Math.round((f.value / prev) * 100)}%` : "—",
      ];
    }),
    [],
    ["Profile of all interviews", "Value"],
    ["Teaching experience", s.teachingExperienceRate],
    ["Call center experience", s.callcenterExperienceRate],
    ["Equipment OK (Online)", s.equipmentComplianceRate],
    ["Grammar test completed", s.grammarTestCompletionRate],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
  setColWidths(summaryWs, [30, 16, 14, 14]);
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  // Sheet 2: Scorecard report per recruiter (ordered by finished interviews).
  const rec = [...data.evaluatorCompliance].sort((a, b) => b.completed - a.completed);
  const recHeader = [
    "Recruiter",
    "Assigned",
    "Scheduled",
    "Connected",
    "Attendance %",
    "Finished",
    "Approved",
    "Approval %",
    "Retake",
    "Not approved",
    "AHT",
    "Avg. score",
    "Compliance %",
    "Missing docs",
    "On interview date",
  ];
  const recAoa: (string | number)[][] = [
    ["Recruitment Scorecard report", `Goals: attendance ${data.goals.attendance}% · approval ${data.goals.approval}% · compliance ${data.goals.compliance}%`],
    [],
    recHeader,
    ...rec.map((e) => [
      e.evaluator || "—",
      e.assigned,
      e.scheduled,
      e.connected,
      e.scheduled ? e.attendanceRate : "—",
      e.completed,
      e.approved,
      e.completed ? e.approvalRate : "—",
      e.retake,
      e.notApproved,
      fmtDuration(e.avgAhtSeconds),
      e.avgScore || "Pending",
      e.completed ? e.avgCompliance : "—",
      e.missingDocumentation,
      e.onInterviewDate,
    ]),
  ];
  const totals: (string | number)[] = [
    "TOTAL",
    rec.reduce((a, e) => a + e.assigned, 0),
    rec.reduce((a, e) => a + e.scheduled, 0),
    rec.reduce((a, e) => a + e.connected, 0),
    "",
    rec.reduce((a, e) => a + e.completed, 0),
    rec.reduce((a, e) => a + e.approved, 0),
    "",
    rec.reduce((a, e) => a + e.retake, 0),
    rec.reduce((a, e) => a + e.notApproved, 0),
    "",
    "",
    "",
    rec.reduce((a, e) => a + e.missingDocumentation, 0),
    rec.reduce((a, e) => a + e.onInterviewDate, 0),
  ];
  if (rec.length) recAoa.push([], totals);
  const recWs = XLSX.utils.aoa_to_sheet(recAoa);
  setColWidths(recWs, [24, 10, 11, 11, 13, 10, 10, 11, 8, 13, 10, 11, 13, 12, 17]);
  applyPctFormat(recWs, [4, 7, 12], 3);
  XLSX.utils.book_append_sheet(wb, recWs, "Recruiter scorecard");

  // Sheet 3: Approval rate breakdowns.
  const brAoa: (string | number)[][] = [
    [`Approval rate breakdown — ${rangeLabel}`, ""],
    [],
    ...rateSection("By recruiter", data.approvalBy.evaluator),
    ...rateSection("By country", data.approvalBy.country),
    ...rateSection("By LOB", data.approvalBy.lob),
    ...rateSection("By week", data.approvalBy.week),
    ...rateSection("By month", data.approvalBy.month),
  ];
  const brWs = XLSX.utils.aoa_to_sheet(brAoa);
  setColWidths(brWs, [24, 13, 11, 11, 12]);
  XLSX.utils.book_append_sheet(wb, brWs, "Approval breakdown");

  // Sheet 4: Approved candidate profile.
  const ap = data.approvedProfile;
  const apAoa: (string | number)[][] = [
    [`Approved candidate profile — ${s.approved} approved`, ""],
    [],
    ...groupSection("By LOB", ap.lob),
    ...groupSection("By country", ap.country),
    ...groupSection("By live English level", ap.level),
    ...groupSection("By experience", ap.experience),
    ...groupSection("By taught children", ap.children),
    ...groupSection("By score range", ap.score),
    ...groupSection("By referral source", ap.referral),
  ];
  const apWs = XLSX.utils.aoa_to_sheet(apAoa);
  setColWidths(apWs, [28, 12]);
  XLSX.utils.book_append_sheet(wb, apWs, "Approved profile");

  // Sheet 5: Charts and level comparison.
  const chAoa: (string | number)[][] = [
    [`Charts data — ${rangeLabel}`, ""],
    [],
    ...groupSection("Interviews by source", data.charts.bySource),
    ...groupSection("Live English level (all interviews)", data.charts.byLiveLevel),
    ...groupSection("By referral source", data.charts.byReferral),
    ...groupSection("By city or branch", data.charts.byCity),
    ...groupSection("Top rejection reasons", data.charts.topRejectionReasons, "Candidates"),
    ["Previous level vs live interview level"],
    ["Candidate", "Previous", "Live", "Difference"],
    ...data.charts.levelComparison.map((r) => [
      r.candidate,
      r.previous,
      r.live,
      r.delta === null ? "—" : r.delta,
    ]),
  ];
  const chWs = XLSX.utils.aoa_to_sheet(chAoa);
  setColWidths(chWs, [30, 14, 14, 12]);
  XLSX.utils.book_append_sheet(wb, chWs, "Charts data");

  const b64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}
