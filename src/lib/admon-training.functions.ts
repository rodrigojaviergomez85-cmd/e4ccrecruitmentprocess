import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmonStaff, type AdmonCandidate } from "./admon.functions";
import { approvedForAdmonTraining, buildAdmonPreparationEmail, validateTrainingStatus } from "./admon-training";

export const listAdmonTraining = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { db } = await requireAdmonStaff(context.userId, context.supabase, true);
  const [{ data, error }, { data: emails, error: emailError }] = await Promise.all([
    db.from("admon_candidates").select("*").eq("stage", "hired").order("technical_at", { ascending: false }),
    db.from("admon_preparation_emails").select("candidate_id, status, requested_at"),
  ]);
  if (error || emailError) throw new Error("No se pudo cargar Training ADMON.");
  return { candidates: ((data ?? []) as unknown as AdmonCandidate[]).filter(approvedForAdmonTraining), emails: emails ?? [] };
});

export const saveAdmonTraining = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["pending", "in_training", "dropout", "completed"]), comment: z.string().trim().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    validateTrainingStatus(data.status, data.comment);
    const { db, email } = await requireAdmonStaff(context.userId, context.supabase, true);
    const { data: c, error } = await db.from("admon_candidates").select("*").eq("id", data.id).single();
    if (error || !c || !approvedForAdmonTraining(c)) throw new Error("El candidato debe aprobar las tres entrevistas.");
    const { error: saveError } = await db.from("admon_candidates").update({ training_status: data.status, training_comment: data.comment }).eq("id", data.id).eq("stage", "hired");
    if (saveError) throw new Error("No se pudo guardar Training.");
    const { writeAudit } = await import("./audit.server");
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "admon.training.update", entityType: "admon_candidate", entityId: data.id, newValue: data });
    return { ok: true };
  });

export const sendAdmonPreparation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), expectedEmail: z.string().email(), expectedName: z.string(), expectedCountry: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, email } = await requireAdmonStaff(context.userId, context.supabase, true);
    const { data: c, error } = await db.from("admon_candidates").select("*").eq("id", data.id).single();
    if (error || !c || !approvedForAdmonTraining(c)) throw new Error("El candidato debe aprobar las tres entrevistas.");
    if (c.email !== data.expectedEmail || c.full_name !== data.expectedName || c.country !== data.expectedCountry) throw new Error("Los datos cambiaron. Vuelve a revisar el correo antes de enviar.");
    const message = buildAdmonPreparationEmail(c.full_name, c.country);
    const { sendEmail, emailConfigured } = await import("./notify.server");
    if (!emailConfigured()) throw new Error("El servicio de correo no está configurado.");
    const payload = { candidate_id: c.id, to_email: c.email, ...{ subject: message.subject, body: message.html }, requested_by: context.userId, status: "requesting" };
    // Unique candidate key claims the send before any external side effect.
    const { error: claimError } = await db.from("admon_preparation_emails").insert(payload);
    if (claimError) {
      if (claimError.code !== "23505") throw new Error("No se pudo registrar el correo.");
      const { data: retry, error: retryError } = await db.from("admon_preparation_emails").update({ ...payload, requested_at: new Date().toISOString() }).eq("candidate_id", c.id).eq("status", "failed").select("candidate_id").maybeSingle();
      if (retryError) throw new Error("No se pudo registrar el correo.");
      if (!retry) return { status: "blocked", detail: "Ya existe una solicitud de correo; no se enviará otra." };
    }
    const delivery = await sendEmail({ to: c.email, ...message, candidateName: c.full_name, result: "admon_preparation" });
    // Provider acceptance is not proof of delivery, including the fallback provider.
    const status = delivery.ok ? "accepted" : delivery.httpStatus ? "failed" : "requesting";
    const { error: recordError } = await db.from("admon_preparation_emails").update({ status, http_status: delivery.httpStatus ?? null }).eq("candidate_id", c.id);
    if (recordError) throw new Error("Solicitud registrada; confirma su estado antes de intentar otro envío.");
    const { writeAudit } = await import("./audit.server");
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "admon.preparation.request", entityType: "admon_candidate", entityId: c.id, newValue: { status } });
    return { status, detail: status === "accepted" ? "Solicitud recibida por Make; envío pendiente de confirmación" : status === "requesting" ? "Solicitud pendiente de revisión; no vuelvas a enviarla." : "No se pudo solicitar el correo." };
  });
