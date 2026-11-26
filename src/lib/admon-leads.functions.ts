import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { requireAdmonStaff } from "./admon.functions";
import { ADMON_LEADS_GID, ADMON_LEADS_SHEET, cleanLeadSearch, deduplicateAdmonLeads, mapAdmonLead } from "./admon-leads";
import { parseCsv } from "./leads";
import { writeAudit } from "./audit.server";

export type AdmonLead = Database["public"]["Tables"]["admon_leads"]["Row"];

export const syncAdmonLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, email } = await requireAdmonStaff(context.userId, context.supabase);
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${ADMON_LEADS_SHEET}/export?format=csv&gid=${ADMON_LEADS_GID}`, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`No se pudo leer la hoja de Leads (${response.status}).`);
    const csv = parseCsv(await response.text());
    if (csv[0]?.[12]?.trim() !== "Nombre Completo (Ej: María Alejandra Canales Rojas)") throw new Error("Cambió la estructura de la hoja; no se importaron datos.");
    const mapped = csv.slice(1).flatMap((r, i) => { const lead = mapAdmonLead(r, i + 2); return lead ? [lead] : []; });
    const leads = deduplicateAdmonLeads(mapped);
    const imported_at = new Date().toISOString();
    for (let i = 0; i < leads.length; i += 500) {
      const { error } = await db.from("admon_leads").upsert(leads.slice(i, i + 500).map((l) => ({ ...l, imported_at })), { onConflict: "source_key" });
      if (error) throw new Error(error.message);
    }
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "admon.leads.import", entityType: "admon_leads", details: { count: leads.length } });
    return { count: leads.length, importedAt: imported_at };
  });

const filterSchema = z.object({
  search: z.string().trim().max(100).default(""), country: z.string().max(80).default(""),
  branch: z.string().max(150).default(""), position: z.string().max(100).default(""),
  cvFilter: z.string().max(100).default(""), recent: z.boolean().default(true), page: z.number().int().min(0).max(10000).default(0),
});

export const listAdmonLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireAdmonStaff(context.userId, context.supabase);
    let query = db.from("admon_leads").select("*", { count: "exact" });
    if (data.country) query = query.eq("country", data.country);
    if (data.position) query = query.eq("position", data.position);
    if (data.branch) query = query.eq("branch", data.branch);
    if (data.cvFilter === "__empty") query = query.eq("cv_filter", "");
    else if (data.cvFilter) query = query.eq("cv_filter", data.cvFilter);
    if (data.search) {
      const term = cleanLeadSearch(data.search);
      if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
    } else if (data.recent) query = query.gte("submitted_at", new Date(Date.now() - 45 * 86400000).toISOString());
    const [{ data: rows, error, count }, { data: last }] = await Promise.all([
      query.order("submitted_at", { ascending: false, nullsFirst: false }).order("id").range(data.page * 50, data.page * 50 + 49),
      db.from("admon_leads").select("imported_at").order("imported_at", { ascending: false }).limit(1),
    ]);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, importedAt: last?.[0]?.imported_at ?? null };
  });

export const admonLeadCatalogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireAdmonStaff(context.userId, context.supabase);
    const country = new Set<string>(), branch = new Set<string>(), position = new Set<string>(), cvFilter = new Set<string>();
    for (let i = 0; ; i += 1000) {
      const { data, error } = await db.from("admon_leads").select("country, branch, position, cv_filter").order("id").range(i, i + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) { if (r.country) country.add(r.country); if (r.branch) branch.add(r.branch); if (r.position) position.add(r.position); if (r.cv_filter) cvFilter.add(r.cv_filter); }
      if (!data || data.length < 1000) break;
    }
    return { country: [...country].sort(), branch: [...branch].sort(), position: [...position].sort(), cvFilter: [...cvFilter].sort() };
  });

export const startAdmonLeadScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db, email } = await requireAdmonStaff(context.userId, context.supabase);
    const { data: lead, error } = await db.from("admon_leads").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if (lead.candidate_id) return { id: lead.candidate_id };
    const { data: linked } = await db.from("admon_candidates").select("id").eq("source_lead_id", lead.id).maybeSingle();
    if (linked) return { id: linked.id };
    let match = db.from("admon_candidates").select("id").eq("position", lead.position);
    match = lead.email ? match.eq("email", lead.email) : match.eq("phone", lead.phone);
    const { data: existing, error: matchError } = await match.order("created_at", { ascending: false }).limit(1);
    if (matchError) throw new Error(matchError.message);
    let id = existing?.[0]?.id;
    if (!id) {
      const { data: candidate, error: createError } = await db.from("admon_candidates").insert({
        full_name: lead.full_name, email: lead.email, phone: lead.phone, country: lead.country, branch: lead.branch,
        position: lead.position, cv_link: lead.cv_link, created_by: context.userId, source_lead_id: lead.id,
      }).select("id").single();
      if (createError) {
        if (createError.code !== "23505") throw new Error(createError.message);
        const { data: winner } = await db.from("admon_candidates").select("id").eq("source_lead_id", lead.id).single();
        if (!winner) throw new Error(createError.message);
        id = winner.id;
      } else id = candidate.id;
    }
    const { error: linkError } = await db.from("admon_leads").update({ candidate_id: id }).eq("id", lead.id);
    if (linkError) throw new Error(linkError.message);
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "admon.lead.screening", entityType: "admon_candidate", entityId: id, details: { leadId: lead.id, reused: !!existing?.length } });
    return { id };
  });