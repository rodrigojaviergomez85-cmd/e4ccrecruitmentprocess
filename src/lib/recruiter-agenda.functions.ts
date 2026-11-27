import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { agendaInput, canUseAgenda } from "./recruiter-agenda";
async function access(db: SupabaseClient<Database>, userId: string) {
  const [{ data: roles, error }, { data: profile }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw new Error("No se pudo verificar tu acceso.");
  const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
  if (
    !canUseAgenda(
      (roles ?? []).map((r) => r.role),
      profile?.active ?? false,
    )
  )
    throw new Error("No tienes acceso a la agenda de Reclutamiento.");
  return { isAdmin };
}
const rangeInput = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine(
    (v) =>
      Date.parse(v.to) >= Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= 93 * 86400000,
    "Selecciona un período de hasta 93 días.",
  );
export const getRecruiterAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => rangeInput.parse(v))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const { isAdmin } = await access(db, context.userId);
    const upper = new Date(Date.parse(`${data.to}T00:00:00-06:00`) + 86400000).toISOString();
    const [entries, staff, settings, appointments] = await Promise.all([
      db
        .from("recruiter_agenda")
        .select("*")
        .lt("starts_at", upper)
        .gt("ends_at", `${data.from}T00:00:00-06:00`)
        .order("starts_at"),
      db.from("staff_profiles").select("user_id,full_name,email").eq("active", true),
      db.from("interview_settings").select("timezone,weekly_hours").eq("id", true).maybeSingle(),
      db
        .from("appointments")
        .select(
          "id,starts_at,ends_at,status,calendly_host_name,application_id,applications(full_name),interviewers(full_name)",
        )
        .gte("starts_at", `${data.from}T00:00:00-06:00`)
        .lt("starts_at", upper)
        .in("status", ["Scheduled", "Confirmed"])
        .order("starts_at"),
    ]);
    if (entries.error) throw new Error("No se pudo cargar la agenda.");
    return {
      entries: entries.data ?? [],
      staff: (staff.data ?? []).filter((s) => /morena|kennia/i.test(s.full_name)),
      settings: settings.data,
      appointments: (appointments.data ?? []).map((a) => ({
        id: a.id,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        candidate:
          (Array.isArray(a.applications) ? a.applications[0] : a.applications)?.full_name ??
          "Candidato",
        host:
          a.calendly_host_name ||
          (Array.isArray(a.interviewers) ? a.interviewers[0] : a.interviewers)?.full_name ||
          "Equipo de Reclutamiento",
        applicationId: a.application_id,
      })),
      isAdmin,
      userId: context.userId,
    };
  });
export const saveRecruiterAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => agendaInput.parse(v))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const { isAdmin } = await access(db, context.userId);
    if (!isAdmin && data.user_id !== context.userId)
      throw new Error("Solo puedes editar tu propia agenda.");
    const { id, ...values } = data;
    const result = id
      ? await db
          .from("recruiter_agenda")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", id)
          .is("source_key", null)
          .select("id")
          .maybeSingle()
      : await db.from("recruiter_agenda").insert(values).select("id").single();
    if (result.error || !result.data) throw new Error("No se pudo guardar la actividad.");
    await db
      .from("audit_logs")
      .insert({
        actor_id: context.userId,
        action: "agenda.save",
        entity_type: "recruiter_agenda",
        entity_id: result.data.id,
        details: { category: values.category, status: values.status },
      });
    return { ok: true };
  });
export const deleteRecruiterAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    await access(context.supabase, context.userId);
    const { error, data: rows } = await context.supabase
      .from("recruiter_agenda")
      .delete()
      .eq("id", data.id)
      .is("source_key", null)
      .select("id");
    if (error || !rows?.length) throw new Error("No puedes eliminar esta actividad.");
    return { ok: true };
  });
