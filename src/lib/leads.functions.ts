import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import { staffTier } from "./roles";
import {
  APPROVAL_STAGES, CATALOG, LEAD_LOBS, LOB_GID, LOB_SHEET, SHEET_COLUMNS, leadAge, matchesApproval, parseCsv, parseSheetDateTime, weekStart, weeklyMetrics,
  type ApprovalFilter, type LeadLob,
} from "./leads";

const SHEET_ID = "1g3n_9HtnADa5jWtFAPrNMF_kZO-cgr9wi11QTd7CCQo";

async function requireLeadsAccess(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: roles }, { data: profile }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active, email, full_name").eq("user_id", userId).maybeSingle(),
  ]);
  const tier = staffTier(((roles ?? []) as { role: string }[]).map((r) => r.role));
  if (!(tier.isAdmin || tier.isRecruitment) || profile?.active === false) throw new Error("Recruitment or Admin access required.");
  return { db, email: (profile?.email as string) ?? null, name: ((profile?.full_name as string) ?? "").toUpperCase() };
}

async function pageAll(build: (from: number, to: number) => any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Imports the four tabs. Rows already edited in the platform keep their platform values. */
export const importLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, email } = await requireLeadsAccess(context.userId);
    const edited = new Set(
      (await pageAll((f, t) => db.from("recruitment_leads").select("source_sheet, source_row").not("edited_in_app_at", "is", null).range(f, t)))
        .map((r) => `${r.source_sheet}#${r.source_row}`),
    );
    const summary: Record<string, number> = {};
    for (const lob of LEAD_LOBS) {
      const sheet = LOB_SHEET[lob];
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${LOB_GID[lob]}`);
      if (!res.ok) throw new Error(`No se pudo leer la pestaña ${sheet} (${res.status}).`);
      const rows = parseCsv(await res.text());
      const c = SHEET_COLUMNS[lob];
      const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
      const batch: Record<string, unknown>[] = [];
      const expOnly: Record<string, unknown>[] = [];
      rows.slice(1).forEach((r, i) => {
        const rowNo = i + 2;
        if (!g(r, c.email) && !g(r, c.name) && !g(r, c.phone)) return;
        const exp = { age: leadAge(g(r, c.age), g(r, c.birth)), teaching_time: g(r, c.teachTime), teaching_exp: g(r, c.teachExp), cc_time: g(r, c.ccTime), cc_exp: g(r, c.ccExp) };
        if (edited.has(`${sheet}#${rowNo}`)) { expOnly.push({ source_sheet: sheet, source_row: rowNo, ...exp }); return; }
        const created = Date.parse(g(r, c.created));
        batch.push({
          lob, source_sheet: sheet, source_row: rowNo,
          lead_created_at: Number.isNaN(created) ? null : new Date(created).toISOString(),
          lead_country: lob === "ONLINE" ? g(r, c.country) : lob,
          branch: g(r, c.branch), full_name: g(r, c.name), email: g(r, c.email), email_norm: g(r, c.email).toLowerCase(), phone: g(r, c.phone),
          filtro_lead: g(r, c.filtro), mensaje: g(r, c.msg), msg_recruiter: g(r, c.msgRec), msg_date: g(r, c.msgDate), msg_time: g(r, c.msgTime),
          llamada: g(r, c.call), call_recruiter: g(r, c.callRec), call_date: g(r, c.callDate), call_time: g(r, c.callTime),
          interview_date: g(r, c.intDate), interview_result: g(r, c.int), comment: g(r, c.comment),
          msg_at: parseSheetDateTime(g(r, c.msgDate), g(r, c.msgTime)),
          call_at: parseSheetDateTime(g(r, c.callDate), g(r, c.callTime)),
          imported_at: new Date().toISOString(), ...exp,
        });
      });
      for (let i = 0; i < batch.length; i += 500) {
        const { error } = await db.from("recruitment_leads").upsert(batch.slice(i, i + 500), { onConflict: "source_sheet,source_row" });
        if (error) throw new Error(error.message);
      }
      for (const row of expOnly) {
        const { source_sheet, source_row, ...exp } = row;
        await db.from("recruitment_leads").update(exp).eq("source_sheet", source_sheet).eq("source_row", source_row);
      }
      summary[lob] = batch.length;
    }
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "leads.import", entityType: "recruitment_leads", details: summary });
    return summary;
  });

const COLS = "id, lob, source_sheet, source_row, lead_created_at, lead_country, branch, full_name, email, email_norm, phone, filtro_lead, mensaje, msg_recruiter, msg_date, msg_time, llamada, call_recruiter, call_date, call_time, interview_date, interview_result, comment, msg_at, call_at, edited_in_app_at, age, teaching_time, teaching_exp, cc_time, cc_exp";

export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    lob: z.enum(["ALL", ...LEAD_LOBS]),
    weekOf: z.number().int(),
    search: z.string().max(100).default(""),
    onlyWeek: z.boolean().default(true),
    approval: z.enum(["ALL", ...APPROVAL_STAGES]).default("ALL"),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireLeadsAccess(context.userId);
    const leads = await pageAll((f, t) => {
      let q = db.from("recruitment_leads").select(COLS).order("lead_created_at", { ascending: false, nullsFirst: false }).range(f, t);
      if (data.lob !== "ALL") q = q.eq("lob", data.lob);
      return q;
    });

    // Lovable data matched by normalized email (live source).
    const [apps, evals, appts, staff] = await Promise.all([
      pageAll((f, t) => db.from("applications").select("id, email, status").range(f, t)),
      pageAll((f, t) => db.from("interview_evaluations").select("application_id, final_result, submitted_at, interview_date, evaluator_id, decided_by").not("submitted_at", "is", null).range(f, t)),
      pageAll((f, t) => db.from("appointments").select("application_id, starts_at, status").range(f, t)),
      pageAll((f, t) => db.from("staff_profiles").select("user_id, full_name").range(f, t)),
    ]);
    const names = new Map<string, string>(staff.map((s) => [s.user_id, s.full_name]));
    const appByEmail = new Map<string, { id: string; status: string }>();
    for (const a of apps) appByEmail.set(String(a.email).trim().toLowerCase(), a);
    const lastEval = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const e of evals) { const p = lastEval.get(e.application_id); if (!p || p.submitted_at < e.submitted_at) lastEval.set(e.application_id, e); }
    const lastAppt = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const a of appts) { const p = lastAppt.get(a.application_id); if (!p || p.starts_at < a.starts_at) lastAppt.set(a.application_id, a); }

    const rows = leads.map((l) => {
      const app = l.email_norm ? appByEmail.get(l.email_norm) : undefined;
      const ev = app ? lastEval.get(app.id) : undefined;
      const ap = app ? lastAppt.get(app.id) : undefined;
      return {
        ...l,
        lovable: app ? {
          application_id: app.id,
          status: app.status as string,
          interviewed_at: (ev?.submitted_at as string) ?? null,
          result: (ev?.final_result as string) ?? null,
          interviewer: ev ? (names.get(ev.decided_by ?? ev.evaluator_id) ?? "") : "",
          appointment_at: (ap?.starts_at as string) ?? null,
          appointment_status: (ap?.status as string) ?? null,
        } : null,
      };
    });

    const from = weekStart(data.weekOf), to = from + 7 * 86400_000;
    const metrics = weeklyMetrics(rows, from, to);
    const s = data.search.trim().toLowerCase();
    const inWeek = (iso: string | null) => !!iso && Date.parse(iso) >= from && Date.parse(iso) < to;
    const filtered = rows.filter((r) =>
      (s ? `${r.full_name} ${r.email} ${r.phone}`.toLowerCase().includes(s) : true) &&
      matchesApproval(r, data.approval as ApprovalFilter) &&
      (data.onlyWeek && !s ? inWeek(r.lead_created_at) || inWeek(r.call_at) || inWeek(r.msg_at) || inWeek(r.lovable?.interviewed_at ?? null) : true),
    );
    const { data: lastImport } = await db.from("recruitment_leads").select("imported_at").order("imported_at", { ascending: false }).limit(1).maybeSingle();
    return { weekFrom: from, metrics, total: filtered.length, rows: filtered.slice(0, 300), lastImport: (lastImport?.imported_at as string) ?? null };
  });

const SV_NOW = () => {
  const d = new Date(Date.now() - 6 * 3600_000);
  const h = d.getUTCHours();
  return {
    date: `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`,
    time: `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}:00 ${h < 12 ? "a.m." : "p.m."}`,
  };
};

/** Updates one lead. A new message/call result stamps that field's own recruiter, date and time. */
export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    filtro_lead: z.string().max(80).optional(),
    mensaje: z.string().max(80).optional(),
    llamada: z.string().max(80).optional(),
    interview_result: z.string().max(80).optional(),
    comment: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { db, email, name } = await requireLeadsAccess(context.userId);
    const { data: lead, error } = await db.from("recruitment_leads").select(COLS).eq("id", data.id).maybeSingle();
    if (error || !lead) throw new Error("Lead no encontrada.");
    const allowed = CATALOG[lead.lob as LeadLob];
    for (const f of ["filtro_lead", "mensaje", "llamada", "interview_result"] as const) {
      const v = data[f];
      // Keep historical values selectable even if not in the catalog.
      if (v && !allowed[f].includes(v) && v !== lead[f]) throw new Error(`Valor no permitido para ${lead.lob}: ${v}`);
    }
    const now = SV_NOW();
    const patch: Record<string, unknown> & { filtro_lead?: string; interview_result?: string; comment?: string } = { edited_in_app_at: new Date().toISOString(), edited_by: context.userId };
    if (data.filtro_lead !== undefined) patch.filtro_lead = data.filtro_lead;
    if (data.interview_result !== undefined) patch.interview_result = data.interview_result;
    if (data.comment !== undefined) patch.comment = data.comment;
    if (data.mensaje !== undefined && data.mensaje !== lead.mensaje) {
      Object.assign(patch, { mensaje: data.mensaje, msg_recruiter: name, msg_date: now.date, msg_time: now.time, msg_at: new Date().toISOString() });
    }
    if (data.llamada !== undefined && data.llamada !== lead.llamada) {
      Object.assign(patch, { llamada: data.llamada, call_recruiter: name, call_date: now.date, call_time: now.time, call_at: new Date().toISOString() });
    }
    const { error: upErr } = await db.from("recruitment_leads").update(patch).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "leads.update", entityType: "recruitment_leads", entityId: data.id, oldValue: lead, newValue: patch });
    return { ok: true };
  });

/** Lead suggestions for creating applicants (name/email/phone search, newest first). */
export const searchLeadSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100).default(""), id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireLeadsAccess(context.userId);
    const cols = "id, lob, lead_country, branch, full_name, email, phone, lead_created_at, filtro_lead, age, cc_time, teaching_time";
    let q = db.from("recruitment_leads").select(cols).order("lead_created_at", { ascending: false, nullsFirst: false }).limit(8);
    if (data.id) q = q.eq("id", data.id);
    else {
      const term = data.q.trim().replace(/[%,()*]/g, " ").trim();
      if (term.length < 3) return [];
      q = q.or(`full_name.ilike.%${term}%,email_norm.ilike.%${term.toLowerCase()}%,phone.ilike.%${term.replace(/\D/g, "") || term}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeadSuggestion[];
  });

export type LeadSuggestion = {
  id: string; lob: LeadLob; lead_country: string | null; branch: string | null; full_name: string | null; email: string | null;
  phone: string | null; lead_created_at: string | null; filtro_lead: string | null; age: string | null; cc_time: string | null; teaching_time: string | null;
};
