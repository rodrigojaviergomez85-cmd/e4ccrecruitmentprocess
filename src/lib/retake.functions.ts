import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt, randomBytes } from "crypto";
import { z } from "zod";

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, "").toLowerCase() : value;

const emailSchema = z.object({
  email: z.preprocess(normalizeEmail, z.string().email().max(255)),
});
const verifySchema = z.object({
  email: z.preprocess(normalizeEmail, z.string().email().max(255)),
  code: z.string().regex(/^\d{6}$/),
});

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function codeEmailHtml(name: string, code: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111">
  <p>Hi ${name},</p>
  <p>Here is your E4CC verification code:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:18px 0">${code}</p>
  <p>This code expires in <strong>10 minutes</strong> and can be used only once.</p>
  <p>If you did not request this code, you can ignore this email.</p>
  <p>Best regards,<br/>E4CC Recruitment Team</p>
</div>`;
}

export const requestRetakeAccess = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => emailSchema.parse(value))
  .handler(async ({ data }) => {
    const email = data.email;
    // Never log the code or the webhook URL.
    console.log("verification_code_request_started", { email });

    const admin = await db();
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await admin
      .from("verification_codes")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) {
      console.log("verification_code_rate_limited", { email });
      return { ok: false as const };
    }

    const { data: application } = await admin
      .from("applications")
      .select("id, full_name, email")
      .ilike("email", email)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const code = String(randomInt(100000, 1000000));
    const { error: insertError } = await admin.from("verification_codes").insert({
      email,
      application_id: application?.id ?? null,
      code_hash: hash(code),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (insertError) {
      console.error("verification_code_store_failed", { email, error: insertError.message });
      return { ok: false as const };
    }

    const candidateName = application?.full_name?.trim() || "Candidate";
    const { sendEmail } = await import("./notify.server");
    const result = await sendEmail({
      to: email,
      subject: "Your E4CC Verification Code",
      html: codeEmailHtml(candidateName.split(/\s+/)[0] ?? "Candidate", code),
      candidateName,
      result: "verification_code",
    });
    if (!result.ok) {
      console.error("verification_code_send_failed", { email, detail: result.detail });
      return { ok: false as const };
    }
    console.log("verification_code_sent", { email, detail: result.detail });
    return { ok: true as const };
  });

export const verifyRetakeAccess = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => verifySchema.parse(value))
  .handler(async ({ data }) => {
    const admin = await db();
    const { data: row } = await admin
      .from("verification_codes")
      .select("id, code_hash, attempts, expires_at, used_at")
      .eq("email", data.email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row || row.attempts >= 5 || new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("The code is invalid or expired.");
    }
    if (row.code_hash !== hash(data.code)) {
      await admin
        .from("verification_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("The code is invalid or expired.");
    }

    const { data: application } = await admin
      .from("applications")
      .select("id, submit_token, status")
      .ilike("email", data.email)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const session = randomBytes(32).toString("hex");
    await admin
      .from("verification_codes")
      .update({
        used_at: new Date().toISOString(),
        session_hash: hash(session),
        session_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        ...(application ? { application_id: application.id } : {}),
      })
      .eq("id", row.id);

    if (!application) {
      // Valid code, but no previous application exists for this email.
      return { outcome: "not_found" as const };
    }

    // The candidate never chooses their own outcome; it comes from the evaluation.
    const { data: evaluation } = await admin
      .from("interview_evaluations")
      .select("final_result, sections, retake_date")
      .eq("application_id", application.id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = evaluation?.final_result ?? null;
    const sections = (evaluation?.sections ?? {}) as Record<string, Record<string, unknown>>;
    const eligibleAgainDate =
      result === "Not approved"
        ? String(sections["result"]?.["eligible_again_date"] ?? evaluation?.retake_date ?? "")
        : "";

    const outcome =
      result === "Not approved"
        ? ("not_approved" as const)
        : result === "Retake required" || (application.status ?? "").startsWith("Retake")
          ? ("retake" as const)
          : ("open" as const);

    return {
      applicationId: application.id,
      token: application.submit_token,
      session,
      outcome,
      eligibleAgainDate,
    };
  });
