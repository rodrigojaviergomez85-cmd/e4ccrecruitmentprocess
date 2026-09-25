/** Server-only: generates the personalised agreement PDF, stores it privately and returns a temporary link for Make. */
import {
  AGREEMENT_TEMPLATE_FILES,
  AGREEMENT_TEMPLATE_VERSION,
  buildAgreementPdf,
  missingAgreementFields,
  ONSITE_TRAINING_HOURS,
  type AgreementData,
  type AgreementKind,
} from "./build";

const LINK_SECONDS = 60 * 60 * 24 * 7;

export type PreparedAgreement =
  | { ok: true; agreementId: string; url: string; name: string; path: string }
  | { ok: false; agreementId: string | null; reason: string };

export async function prepareAgreement(opts: {
  applicationId: string;
  managerEvaluationId: string | null;
  kind: AgreementKind;
  data: AgreementData;
  actorId: string | null;
  isTest?: boolean;
}): Promise<PreparedAgreement> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const base = {
    application_id: opts.applicationId,
    manager_evaluation_id: opts.managerEvaluationId,
    kind: opts.kind,
    template_file: AGREEMENT_TEMPLATE_FILES[opts.kind],
    template_version: AGREEMENT_TEMPLATE_VERSION,
    data: opts.data,
    is_test: Boolean(opts.isTest),
    created_by: opts.actorId,
  };
  const fail = async (reason: string): Promise<PreparedAgreement> => {
    const { data: row } = await db
      .from("candidate_agreements")
      .insert({ ...base, document_status: "failed", email_status: "pending_agreement", error_message: reason })
      .select("id")
      .single();
    return { ok: false, agreementId: row?.id ?? null, reason };
  };

  const missing = missingAgreementFields(opts.kind, opts.data);
  if (missing.length) return fail(`Missing agreement data: ${missing.join(", ")}`);
  if (opts.kind === "onsite" && ONSITE_TRAINING_HOURS === null && !opts.isTest)
    return fail("Onsite agreement on hold: training hours clause (40 or 50) not confirmed");

  let bytes: Uint8Array;
  try {
    bytes = await buildAgreementPdf(opts.kind, opts.data, { test: !!opts.isTest, allowPendingHours: !!opts.isTest });
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 300) : "PDF generation failed");
  }

  const safe = opts.data.fullName.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60);
  const name = `Convenio_E4CC_${opts.kind === "online" ? "Online" : "Onsite"}_${safe}.pdf`;
  const path = `${opts.applicationId}/${Date.now()}_${name}`;
  const up = await db.storage.from("agreements").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return fail(`Storage upload failed: ${up.error.message}`);
  const signed = await db.storage.from("agreements").createSignedUrl(path, LINK_SECONDS, { download: name });
  if (signed.error || !signed.data?.signedUrl) return fail("Could not create secure link for the agreement");

  // Older generated versions for this application are kept but marked superseded.
  await db
    .from("candidate_agreements")
    .update({ document_status: "superseded" })
    .eq("application_id", opts.applicationId)
    .eq("document_status", "generated")
    .neq("email_status", "sent");
  const { data: row, error } = await db
    .from("candidate_agreements")
    .insert({ ...base, storage_path: path, document_status: "generated", email_status: "pending", generated_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return { ok: false, agreementId: null, reason: `Could not record agreement: ${error.message}` };
  return { ok: true, agreementId: row.id, url: signed.data.signedUrl, name, path };
}

export async function markAgreementEmail(agreementId: string | null, status: "sent" | "failed" | "pending_agreement", detail?: string) {
  if (!agreementId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any)
    .from("candidate_agreements")
    .update({ email_status: status, sent_at: status === "sent" ? new Date().toISOString() : null, error_message: status === "sent" ? null : detail ?? null })
    .eq("id", agreementId);
}

export async function agreementAlreadySent(applicationId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("candidate_agreements")
    .select("id")
    .eq("application_id", applicationId)
    .eq("email_status", "sent")
    .eq("is_test", false)
    .limit(1);
  return Boolean(data?.length);
}
