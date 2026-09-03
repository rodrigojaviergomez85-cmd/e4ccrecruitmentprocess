import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Admin access required.");
  return supabaseAdmin;
}

export const listAllCountries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId);
    const [{ data: countries }, { data: cities }] = await Promise.all([
      db.from("countries").select("*").order("sort_order"),
      db.from("cities").select("id, country_code, name, active").order("name"),
    ]);
    return { countries: countries ?? [], cities: cities ?? [] };
  });

export const upsertCountry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z
          .string()
          .trim()
          .min(2)
          .max(8)
          .transform((v) => v.toUpperCase()),
        name: z.string().trim().min(2).max(80),
        dial_code: z
          .string()
          .trim()
          .regex(/^\+\d{1,4}$/, "Use a format like +503"),
        flag: z.string().trim().max(8).default(""),
        timezone: z.string().trim().min(3).max(64).default("America/El_Salvador"),
        active: z.boolean().default(true),
        sort_order: z.number().int().min(0).max(9999).default(100),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await assertAdmin(context.userId);
    const { error } = await db.from("countries").upsert(data, { onConflict: "code" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCountryActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().max(8), active: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await assertAdmin(context.userId);
    const { error } = await db
      .from("countries")
      .update({ active: data.active })
      .eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ country_code: z.string().max(8), name: z.string().trim().min(2).max(80) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await assertAdmin(context.userId);
    const { error } = await db
      .from("cities")
      .upsert(data, { onConflict: "country_code,name" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCityActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await assertAdmin(context.userId);
    const { error } = await db.from("cities").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStaffCountryAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId);
    const [{ data: roles }, { data: assignments }] = await Promise.all([
      db.from("user_roles").select("user_id, role"),
      db.from("staff_countries").select("user_id, country_code"),
    ]);
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const byId = new Map(users.users.map((u) => [u.id, u.email ?? ""]));
    const grouped = new Map<string, { user_id: string; email: string; roles: string[]; countries: string[] }>();
    for (const row of roles ?? []) {
      const entry = grouped.get(row.user_id) ?? {
        user_id: row.user_id,
        email: byId.get(row.user_id) ?? "",
        roles: [],
        countries: [],
      };
      entry.roles.push(row.role as string);
      grouped.set(row.user_id, entry);
    }
    for (const row of assignments ?? []) {
      const entry = grouped.get(row.user_id);
      if (entry) entry.countries.push(row.country_code);
    }
    return Array.from(grouped.values());
  });

export const setStaffCountries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ user_id: z.string().uuid(), country_codes: z.array(z.string().max(8)).max(50) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await assertAdmin(context.userId);
    const { error: delError } = await db
      .from("staff_countries")
      .delete()
      .eq("user_id", data.user_id);
    if (delError) throw new Error(delError.message);
    if (data.country_codes.length) {
      const { error } = await db
        .from("staff_countries")
        .insert(data.country_codes.map((code) => ({ user_id: data.user_id, country_code: code })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
