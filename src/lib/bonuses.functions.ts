import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import { staffTier } from "./roles";
import { hiringBonusAmount, referralBonusAmount, schedule } from "./bonuses";

async function requireBonusStaff(userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [{ data: roles }, { data: profile }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active, email").eq("user_id", userId).maybeSingle(),
  ]);
  const tier = staffTier((roles ?? []).map((r) => r.role as string));
  if (!tier.isStaff || profile?.active === false) throw new Error("Staff access required.");
  return { db, email: profile?.email ?? null };
}

export type BonusRow = {
  key: string; applicationId: string; kind: "Hiring bonus" | "Referido"; beneficiary: string; candidate: string;
  country: string; modality: string; certifiedOn: string | null; total: number;
  installments: { month: number; amount: number; payOn: string }[]; status: string;
};

/** One row per payable bonus: hiring bonus of certified candidates and referral bonus of certified referrals. */
export const listBonuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireBonusStaff(context.userId);
    const { data: roster } = await db.from("training_roster").select("application_id, outcome_at, agreed_schedule").eq("certification", "CERTIFIED");
    const ids = (roster ?? []).map((r) => r.application_id);
    if (!ids.length) return [] as BonusRow[];
    const [{ data: apps }, { data: evals }, { data: refs }] = await Promise.all([
      db.from("applications").select("id, full_name, email, country, recruitment_progress(work_modality)").in("id", ids),
      db.from("interview_evaluations").select("application_id, hiring_bonus, attempt_number, final_result").in("application_id", ids).eq("final_result", "Approved for last step"),
      db.from("referrals").select("id, application_id, referred_email, bonus_status, referrers(full_name)").limit(5000),
    ]);
    const appById = new Map((apps ?? []).map((a) => [a.id, a]));
    const byEmail = new Map((apps ?? []).map((a) => [a.email.trim().toLowerCase(), a.id]));
    const bonusOf = new Map<string, { attempt: number; text: string | null }>();
    for (const e of evals ?? []) {
      const prev = bonusOf.get(e.application_id);
      if (!prev || e.attempt_number > prev.attempt) bonusOf.set(e.application_id, { attempt: e.attempt_number, text: e.hiring_bonus });
    }
    const rows: BonusRow[] = [];
    for (const r of roster ?? []) {
      const a = appById.get(r.application_id);
      if (!a) continue;
      const prog = (Array.isArray(a.recruitment_progress) ? a.recruitment_progress[0] : a.recruitment_progress) as { work_modality?: string | null } | null;
      const modality = prog?.work_modality ?? "";
      const online = /online/i.test(modality);
      const base = { applicationId: a.id, candidate: a.full_name, country: a.country, modality, certifiedOn: r.outcome_at };
      const hb = hiringBonusAmount(bonusOf.get(a.id)?.text);
      if (hb) rows.push({ ...base, key: `h-${a.id}`, kind: "Hiring bonus", beneficiary: a.full_name, total: hb, installments: r.outcome_at ? schedule(r.outcome_at, hb) : [], status: "" });
      for (const ref of refs ?? []) {
        const linked = ref.application_id ?? (ref.referred_email ? byEmail.get(ref.referred_email.trim().toLowerCase()) : undefined);
        if (linked !== a.id) continue;
        const amt = referralBonusAmount(online, r.agreed_schedule);
        const referrer = (ref.referrers as { full_name?: string } | null)?.full_name ?? "—";
        rows.push({ ...base, key: `r-${ref.id}`, kind: "Referido", beneficiary: referrer, total: amt, installments: r.outcome_at ? schedule(r.outcome_at, amt) : [], status: ref.bonus_status });
      }
    }
    return rows.sort((x, y) => (x.certifiedOn ?? "").localeCompare(y.certifiedOn ?? ""));
  });

/** Records the real certification date that starts the bonus count. */
export const setCertificationDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, email } = await requireBonusStaff(context.userId);
    const { error } = await db.from("training_roster").update({ outcome_at: data.date, updated_by: context.userId }).eq("application_id", data.applicationId).eq("certification", "CERTIFIED");
    if (error) throw new Error(error.message);
    await writeAudit(db as never, { actorId: context.userId, actorEmail: email, action: "training.certification_date_set", entityType: "training_roster", entityId: data.applicationId, applicationId: data.applicationId, newValue: { outcome_at: data.date } });
    return { ok: true };
  });
