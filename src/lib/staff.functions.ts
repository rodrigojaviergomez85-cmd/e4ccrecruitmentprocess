import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { writeAudit } from "./audit.server";
import { primaryRole, STAFF_ROLES, staffTier, type StaffRole } from "./roles";

export { STAFF_ROLES, type StaffRole };

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Never logs passwords, tokens or recordings — only actor, action and safe metadata. */
async function audit(
  db: Awaited<ReturnType<typeof getAdmin>>,
  entry: {
    actorId: string;
    actorEmail?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
    oldValue?: unknown;
    newValue?: unknown;
  },
) {
  await writeAudit(db as never, entry);
}

async function requireActiveAdmin(userId: string) {
  const db = await getAdmin();
  const [{ data: roles }, { data: profile }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin"),
    db.from("staff_profiles").select("active, email").eq("user_id", userId).maybeSingle(),
  ]);
  if (!roles?.length) throw new Error("Admin access required.");
  if (profile && profile.active === false) throw new Error("Your account is deactivated.");
  return { db, email: profile?.email ?? null };
}

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Current user's staff context: role, active flag, forced password change. */
export const getStaffContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await getAdmin();
    const [{ data: roles }, { data: profile }, { data: countryRows }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", context.userId),
      db.from("staff_profiles").select("*").eq("user_id", context.userId).maybeSingle(),
      db.from("staff_countries").select("country_code").eq("user_id", context.userId),
    ]);
    const roleList = (roles ?? []).map((r) => r.role as string);
    const tier = staffTier(roleList);
    const active = profile ? profile.active : tier.isStaff;
    if (profile) {
      await db
        .from("staff_profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("user_id", context.userId);
    }
    return {
      isStaff: tier.isStaff && active,
      active,
      roles: roleList,
      role: tier.primary,
      isAdmin: tier.isAdmin,
      isRecruitment: tier.isRecruitment,
      isManager: tier.isManager,
      mustChangePassword: profile?.must_change_password ?? false,
      fullName: profile?.full_name ?? "",
      countries: (countryRows ?? []).map((c) => c.country_code),
    };
  });

export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await getAdmin();
    await db
      .from("staff_profiles")
      .update({ must_change_password: false })
      .eq("user_id", context.userId);
    await audit(db, {
      actorId: context.userId,
      action: "password.changed",
      entityType: "staff",
      entityId: context.userId,
    });
    return { ok: true };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireActiveAdmin(context.userId);
    const [{ data: profiles }, { data: roles }, { data: countries }] = await Promise.all([
      db.from("staff_profiles").select("*").order("created_at", { ascending: false }),
      db.from("user_roles").select("user_id, role"),
      db.from("staff_countries").select("user_id, country_code"),
    ]);
    return (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      active: p.active,
      must_change_password: p.must_change_password,
      last_login_at: p.last_login_at,
      created_at: p.created_at,
      roles: (roles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role as string),
      role: primaryRole(
        (roles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role as string),
      ),
      countries: (countries ?? [])
        .filter((c) => c.user_id === p.user_id)
        .map((c) => c.country_code),
    }));
  });

const staffInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  role: z.enum(STAFF_ROLES),
  countries: z.array(z.string().max(8)).max(50).default([]),
  sendInvite: z.boolean().default(false),
  origin: z.string().url().max(200),
});

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => staffInput.parse(d))
  .handler(async ({ context, data }) => {
    if (data.role !== "admin" && data.countries.length === 0) {
      throw new Error("Select at least one country for Recruitment or Manager accounts.");
    }
    const { db, email: actorEmail } = await requireActiveAdmin(context.userId);
    const tempPassword = generateTempPassword();
    const email = data.email.toLowerCase();

    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the user.");
    const userId = created.user.id;

    await db.from("staff_profiles").upsert({
      user_id: userId,
      full_name: data.fullName,
      email,
      active: true,
      must_change_password: true,
      created_by: context.userId,
    });
    await db.from("user_roles").insert({ user_id: userId, role: data.role });
    if (data.countries.length) {
      await db
        .from("staff_countries")
        .insert(data.countries.map((c) => ({ user_id: userId, country_code: c })));
    }

    let invited = false;
    if (data.sendInvite) {
      const { error: linkError } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${data.origin}/reset-password`,
      });
      invited = !linkError;
    }

    await audit(db, {
      actorId: context.userId,
      actorEmail,
      action: "staff.created",
      entityType: "staff",
      entityId: userId,
      details: { email, invited },
      newValue: { role: data.role, countries: data.countries },
    });

    // The temporary password is returned once and never stored anywhere.
    return { userId, tempPassword, invited };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, email } = await requireActiveAdmin(context.userId);
    if (data.userId === context.userId && !data.active) {
      throw new Error("You cannot deactivate your own account.");
    }
    const { error } = await db
      .from("staff_profiles")
      .update({ active: data.active })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: data.active ? "staff.activated" : "staff.deactivated",
      entityType: "staff",
      entityId: data.userId,
      oldValue: { active: !data.active },
      newValue: { active: data.active },
    });
    return { ok: true };
  });

export const updateStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(STAFF_ROLES),
        countries: z.array(z.string().max(8)).max(50).default([]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.role !== "admin" && data.countries.length === 0) {
      throw new Error("Select at least one country for Recruitment or Manager accounts.");
    }
    const { db, email } = await requireActiveAdmin(context.userId);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("You cannot remove your own Admin role.");
    }
    const [{ data: oldRoles }, { data: oldCountries }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", data.userId),
      db.from("staff_countries").select("country_code").eq("user_id", data.userId),
    ]);
    const before = {
      role: primaryRole((oldRoles ?? []).map((r) => r.role as string)),
      countries: (oldCountries ?? []).map((c) => c.country_code).sort(),
    };
    await db.from("user_roles").delete().eq("user_id", data.userId);
    await db.from("user_roles").insert({ user_id: data.userId, role: data.role });
    await db.from("staff_countries").delete().eq("user_id", data.userId);
    if (data.countries.length) {
      await db
        .from("staff_countries")
        .insert(data.countries.map((c) => ({ user_id: data.userId, country_code: c })));
    }
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action:
        before.role !== data.role ? "staff.role_changed" : "staff.countries_changed",
      entityType: "staff",
      entityId: data.userId,
      oldValue: before,
      newValue: { role: data.role, countries: [...data.countries].sort() },
    });
    return { ok: true };
  });

export const sendStaffResetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), origin: z.string().url().max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, email } = await requireActiveAdmin(context.userId);
    const { data: profile } = await db
      .from("staff_profiles")
      .select("email")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!profile?.email) throw new Error("Staff member not found.");
    const { error } = await db.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${data.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
    await db
      .from("staff_profiles")
      .update({ must_change_password: true })
      .eq("user_id", data.userId);
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: "staff.reset_link_sent",
      entityType: "staff",
      entityId: data.userId,
    });
    return { ok: true };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await requireActiveAdmin(context.userId);
    const { data } = await db
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });
