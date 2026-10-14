import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes, randomInt } from "crypto";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import { staffTier } from "./roles";
import { BONUS_STATUSES, normalizeEmail, publicStatus } from "./referrals";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const SESSION_COOKIE = "e4cc_referrals";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Full staff only (Admin, Recruitment, Manager); trainer-only accounts are excluded. */
async function requireStaff(userId: string) {
  const db = await admin();
  const [{ data: roles }, { data: profile }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active, email").eq("user_id", userId).maybeSingle(),
  ]);
  const tier = staffTier((roles ?? []).map((r) => r.role as string));
  if (!tier.isStaff || profile?.active === false) throw new Error("Staff access required.");
  return { db, email: profile?.email ?? null };
}

type Db = Awaited<ReturnType<typeof admin>>;

async function statusesFor(db: Db, appIds: string[]) {
  const map = new Map<string, { status: string; appointment: boolean; training: string | null }>();
  if (!appIds.length) return map;
  const [{ data: apps }, { data: appts }, { data: roster }] = await Promise.all([
    db.from("applications").select("id, status").in("id", appIds),
    db.from("appointments").select("application_id, status").in("application_id", appIds).in("status", ["Scheduled", "Confirmed"]),
    db.from("training_roster").select("application_id, status").in("application_id", appIds),
  ]);
  for (const a of apps ?? []) map.set(a.id, { status: a.status, appointment: false, training: null });
  for (const a of appts ?? []) { const m = map.get(a.application_id); if (m) m.appointment = true; }
  for (const r of roster ?? []) { const m = map.get(r.application_id); if (m) m.training = r.status; }
  return map;
}

/** Links unlinked referrals to an existing application by exact normalized email only. */
async function autoLink(db: Db) {
  const { data: rows } = await db.from("referrals").select("id, referred_email").is("application_id", null).not("referred_email", "is", null).limit(500);
  for (const r of rows ?? []) {
    const { data: app } = await db.from("applications").select("id").ilike("email", r.referred_email!).is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (app) await db.from("referrals").update({ application_id: app.id }).eq("id", r.id);
  }
}

function confirmationHtml(name: string, referred: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111">
  <p>Hola ${name},</p>
  <p>Recibimos tu referido <strong>${referred}</strong>. ¡Gracias por recomendar talento a E4CC!</p>
  <p>Puedes consultar el estado de tus referidos aquí:<br/><a href="__URL__">__URL__</a></p>
  <p>Te enviaremos un código temporal a este correo cada vez que quieras consultar.</p>
  <p>E4CC Recruitment Team</p></div>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------------- Staff ----------------

export const listReferrals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireStaff(context.userId);
    await autoLink(db);
    const { data, error } = await db
      .from("referrals")
      .select("id, referred_name, referred_email, referred_phone, lob, branch, comments, bonus_status, disputed, source, application_id, updated_at, created_at, referrers(id, full_name, email, phone, email_validated_at), applications(full_name, status)")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const st = await statusesFor(db, (data ?? []).flatMap((r) => (r.application_id ? [r.application_id] : [])));
    return (data ?? []).map((r) => {
      const s = r.application_id ? st.get(r.application_id) : undefined;
      const ref = r.referrers as { id: string; full_name: string; email: string | null; phone: string; email_validated_at: string | null } | null;
      const app = r.applications as { full_name: string; status: string } | null;
      return {
        id: r.id,
        referredName: r.referred_name,
        referredEmail: r.referred_email,
        referredPhone: r.referred_phone,
        lob: r.lob,
        branch: r.branch,
        comments: r.comments,
        bonusStatus: r.bonus_status,
        disputed: r.disputed,
        source: r.source,
        applicationId: r.application_id,
        applicationName: app?.full_name ?? null,
        internalStatus: app?.status ?? null,
        publicStatus: publicStatus({ linked: Boolean(r.application_id), appStatus: s?.status, hasActiveAppointment: s?.appointment, trainingStatus: s?.training }),
        referrerId: ref?.id ?? null,
        referrerName: ref?.full_name ?? "",
        referrerEmail: ref?.email ?? null,
        referrerPhone: ref?.phone ?? "",
        referrerValidated: Boolean(ref?.email_validated_at),
        updatedAt: r.updated_at,
      };
    });
  });

const createSchema = z.object({
  referrerName: z.string().trim().min(2).max(150),
  referrerEmail: z.string().trim().max(255).optional().default(""),
  referrerPhone: z.string().trim().max(40).optional().default(""),
  referredName: z.string().trim().min(2).max(150),
  referredEmail: z.string().trim().max(255).optional().default(""),
  referredPhone: z.string().trim().max(40).optional().default(""),
  lob: z.string().trim().max(80).optional().default(""),
  branch: z.string().trim().max(120).optional().default(""),
  comments: z.string().trim().max(1000).optional().default(""),
});

export const createReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { db, email: actorEmail } = await requireStaff(context.userId);
    const rEmail = normalizeEmail(data.referrerEmail) || null;
    const dEmail = normalizeEmail(data.referredEmail) || null;
    for (const e of [rEmail, dEmail]) if (e && !z.string().email().safeParse(e).success) throw new Error("Correo inválido.");

    let referrerId: string;
    const existing = rEmail ? (await db.from("referrers").select("id").eq("email", rEmail).maybeSingle()).data : null;
    if (existing) referrerId = existing.id;
    else {
      const { data: created, error } = await db.from("referrers").insert({ full_name: data.referrerName, email: rEmail, phone: data.referrerPhone }).select("id").single();
      if (error) throw new Error(error.message);
      referrerId = created.id;
    }
    const { data: row, error } = await db.from("referrals").insert({
      referrer_id: referrerId,
      referred_name: data.referredName,
      referred_email: dEmail,
      referred_phone: data.referredPhone,
      lob: data.lob,
      branch: data.branch,
      comments: data.comments,
      source: "manual",
      created_by: context.userId,
      submitted_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    await writeAudit(db as never, { actorId: context.userId, actorEmail, action: "referral.created", entityType: "referral", entityId: row.id });

    let emailSent = false;
    if (rEmail) {
      const { sendEmail, baseUrl } = await import("./notify.server");
      const url = `${baseUrl()}/mis-referidos`;
      const res = await sendEmail({
        to: rEmail,
        subject: "Recibimos tu referido — E4CC",
        html: confirmationHtml(esc(data.referrerName.split(/\s+/)[0] ?? ""), esc(data.referredName)).replaceAll("__URL__", url),
        candidateName: data.referrerName,
        result: "referral_received",
      });
      emailSent = res.ok;
      if (res.ok) await db.from("referrals").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", row.id);
    }
    return { id: row.id, emailSent };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  bonusStatus: z.enum(BONUS_STATUSES).optional(),
  disputed: z.boolean().optional(),
  applicationEmail: z.string().trim().max(255).optional(),
  unlink: z.boolean().optional(),
});

export const updateReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => updateSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { db, email: actorEmail } = await requireStaff(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.bonusStatus) patch["bonus_status"] = data.bonusStatus;
    if (data.disputed !== undefined) patch["disputed"] = data.disputed;
    if (data.unlink) patch["application_id"] = null;
    if (data.applicationEmail) {
      const e = normalizeEmail(data.applicationEmail);
      const { data: app } = await db.from("applications").select("id").ilike("email", e).is("archived_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!app) throw new Error("No hay candidatura con ese correo.");
      patch["application_id"] = app.id;
      patch["referred_email"] = e;
    }
    const { error } = await db.from("referrals").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(db as never, { actorId: context.userId, actorEmail, action: "referral.updated", entityType: "referral", entityId: data.id, newValue: patch });
    return { ok: true };
  });

const referrerSchema = z.object({ id: z.string().uuid(), email: z.string().trim().max(255), validated: z.boolean() });

/** Recruitment confirms which email belongs to the referrer; only validated emails can open the portal. */
export const validateReferrer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => referrerSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { db, email: actorEmail } = await requireStaff(context.userId);
    const email = normalizeEmail(data.email);
    if (!z.string().email().safeParse(email).success) throw new Error("Correo inválido.");
    const { data: clash } = await db.from("referrers").select("id").eq("email", email).neq("id", data.id).maybeSingle();
    if (clash) throw new Error("Ese correo ya pertenece a otro referidor.");
    const { error } = await db.from("referrers").update({
      email,
      email_validated_at: data.validated ? new Date().toISOString() : null,
      email_validated_by: data.validated ? context.userId : null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!data.validated) await db.from("referral_sessions").update({ revoked_at: new Date().toISOString() }).eq("referrer_id", data.id).is("revoked_at", null);
    await writeAudit(db as never, { actorId: context.userId, actorEmail, action: data.validated ? "referrer.validated" : "referrer.unvalidated", entityType: "referrer", entityId: data.id });
    return { ok: true };
  });

// ---------------- Public portal ----------------

const emailOnly = z.object({ email: z.preprocess((v) => (typeof v === "string" ? normalizeEmail(v) : v), z.string().email().max(255)) });

/** Same response whether or not the email exists, so the portal never reveals who refers. */
export const requestReferralCode = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => emailOnly.parse(v))
  .handler(async ({ data }) => {
    const db = await admin();
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db.from("referral_access_codes").select("id", { count: "exact", head: true }).eq("email", data.email).gte("created_at", since);
    if ((count ?? 0) >= 3) return { ok: true as const };
    const { data: referrer } = await db.from("referrers").select("id, full_name").eq("email", data.email).not("email_validated_at", "is", null).maybeSingle();
    if (!referrer) return { ok: true as const };

    await db.from("referral_access_codes").update({ used_at: new Date().toISOString() }).eq("email", data.email).is("used_at", null);
    const code = String(randomInt(100000, 1000000));
    const { error } = await db.from("referral_access_codes").insert({ email: data.email, code_hash: hash(code), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (error) return { ok: false as const };
    const { sendEmail } = await import("./notify.server");
    const first = esc(referrer.full_name.split(/\s+/)[0] ?? "");
    const res = await sendEmail({
      to: data.email,
      subject: "Tu código para ver tus referidos — E4CC",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111"><p>Hola ${first},</p><p>Tu código para consultar tus referidos es:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>Vence en <strong>10 minutos</strong> y solo se puede usar una vez.</p><p>Si no lo pediste, ignora este correo.</p></div>`,
      candidateName: referrer.full_name,
      result: "verification_code",
    });
    if (!res.ok) console.error("referral_code_send_failed", { detail: res.detail });
    return { ok: res.ok };
  });

const verifyInput = emailOnly.extend({ code: z.string().regex(/^\d{6}$/) });

export const verifyReferralCode = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => verifyInput.parse(v))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db.from("referral_access_codes").select("id, code_hash, attempts, expires_at").eq("email", data.email).is("used_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row || row.attempts >= 5 || new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const };
    if (row.code_hash !== hash(data.code)) {
      await db.from("referral_access_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return { ok: false as const };
    }
    const { data: used } = await db.from("referral_access_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
    if (!used?.length) return { ok: false as const };
    const { data: referrer } = await db.from("referrers").select("id").eq("email", data.email).not("email_validated_at", "is", null).maybeSingle();
    if (!referrer) return { ok: false as const };
    const token = randomBytes(32).toString("hex");
    await db.from("referral_sessions").insert({ referrer_id: referrer.id, token_hash: hash(token), expires_at: new Date(Date.now() + 2 * 3600_000).toISOString() });
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2 * 3600 });
    return { ok: true as const };
  });

/** The referrer is derived only from the session cookie, never from client input. */
export const getMyReferrals = createServerFn({ method: "GET" }).handler(async () => {
  const { getCookie } = await import("@tanstack/react-start/server");
  const token = getCookie(SESSION_COOKIE);
  if (!token) return { signedIn: false as const };
  const db = await admin();
  const { data: session } = await db.from("referral_sessions").select("referrer_id, expires_at, revoked_at").eq("token_hash", hash(token)).maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) return { signedIn: false as const };
  const { data: referrer } = await db.from("referrers").select("full_name, email_validated_at").eq("id", session.referrer_id).maybeSingle();
  if (!referrer?.email_validated_at) return { signedIn: false as const };
  const { data: rows } = await db.from("referrals").select("id, referred_name, application_id, bonus_status, updated_at, created_at").eq("referrer_id", session.referrer_id).order("created_at", { ascending: false });
  const st = await statusesFor(db, (rows ?? []).flatMap((r) => (r.application_id ? [r.application_id] : [])));
  return {
    signedIn: true as const,
    referrerName: referrer.full_name,
    referrals: (rows ?? []).map((r) => {
      const s = r.application_id ? st.get(r.application_id) : undefined;
      return {
        id: r.id,
        name: r.referred_name,
        status: publicStatus({ linked: Boolean(r.application_id), appStatus: s?.status, hasActiveAppointment: s?.appointment, trainingStatus: s?.training }),
        bonusStatus: r.bonus_status,
        updatedAt: r.updated_at,
      };
    }),
  };
});

export const signOutReferrals = createServerFn({ method: "POST" }).handler(async () => {
  const { getCookie, deleteCookie } = await import("@tanstack/react-start/server");
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    const db = await admin();
    await db.from("referral_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash(token));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});
