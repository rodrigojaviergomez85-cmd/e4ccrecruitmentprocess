import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt, randomBytes } from "crypto";
import { z } from "zod";

const emailSchema = z.object({ email: z.string().trim().email().max(255) });
const verifySchema = emailSchema.extend({ code: z.string().regex(/^\d{6}$/) });

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const requestRetakeAccess = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => emailSchema.parse(value))
  .handler(async ({ data }) => {
    const admin = await db();
    const email = data.email.toLowerCase();
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await admin
      .from("retake_access_tokens")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if ((count ?? 0) > 100) return { ok: true };

    const { data: application } = await admin
      .from("applications")
      .select("id, full_name, email")
      .ilike("email", email)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!application) return { ok: true };

    const code = String(randomInt(100000, 1000000));
    await admin.from("retake_access_tokens").insert({
      application_id: application.id,
      code_hash: hash(code),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    const { sendEmail } = await import("./notify.server");
    await sendEmail({
      to: application.email,
      subject: "Your E4CC Retake access code",
      html: `<p>Hi ${application.full_name.split(/\s+/)[0]},</p><p>Your secure code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes.</p>`,
    });
    return { ok: true };
  });

export const verifyRetakeAccess = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => verifySchema.parse(value))
  .handler(async ({ data }) => {
    const admin = await db();
    const { data: application } = await admin
      .from("applications")
      .select("id, submit_token")
      .ilike("email", data.email.toLowerCase())
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!application) throw new Error("The code is invalid or expired.");
    const { data: row } = await admin
      .from("retake_access_tokens")
      .select("id, code_hash, attempts, expires_at, used_at")
      .eq("application_id", application.id)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row || row.attempts >= 5 || new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("The code is invalid or expired.");
    }
    if (row.code_hash !== hash(data.code)) {
      await admin.from("retake_access_tokens").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      throw new Error("The code is invalid or expired.");
    }
    const session = randomBytes(32).toString("hex");
    await admin
      .from("retake_access_tokens")
      .update({ used_at: new Date().toISOString(), session_hash: hash(session), session_expires_at: new Date(Date.now() + 60 * 60_000).toISOString() })
      .eq("id", row.id);
    return { applicationId: application.id, token: application.submit_token, session };
  });