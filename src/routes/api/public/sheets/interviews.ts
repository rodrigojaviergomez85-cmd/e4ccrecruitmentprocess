import { createFileRoute } from "@tanstack/react-router";

/**
 * Feed for the Google Sheet tab "ENTREVISTAS LOVABLE" (pulled by Apps Script).
 * Protected by the SHEETS_SYNC_TOKEN bearer token. Returns one row per
 * interview with only the columns the sheet's lookup formulas need.
 */
export const Route = createFileRoute("/api/public/sheets/interviews")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["SHEETS_SYNC_TOKEN"];
        if (!secret) return new Response("Server configuration error", { status: 500 });
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const d = (v: string) => createHash("sha256").update(v).digest();
        if (!timingSafeEqual(d(token), d(secret))) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const [{ data: staff }, evals] = await Promise.all([
          db.from("staff_profiles").select("user_id, full_name"),
          (async () => {
            const all: any[] = [];
            for (let from = 0; ; from += 1000) {
              const { data, error } = await db
                .from("interview_evaluations")
                .select("*, applications(email, country)")
                .order("created_at", { ascending: true })
                .range(from, from + 999);
              if (error) throw new Error(error.message);
              all.push(...(data ?? []));
              if (!data || data.length < 1000) break;
            }
            return all;
          })(),
        ]);
        const names = new Map<string, string>((staff ?? []).map((s: any) => [s.user_id, s.full_name]));
        const sv = (iso: string | null) =>
          iso
            ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date(iso))
            : "";

        const rows = evals
          .filter((e) => e.applications?.email)
          .map((e) => {
            const who = e.decided_by ?? e.evaluator_id;
            const date = e.interview_date ?? sv(e.started_at ?? e.created_at);
            const finalAt = e.decided_at ?? e.submitted_at ?? e.updated_at ?? e.created_at;
            return [
              e.id,
              String(e.applications.email).trim().toLowerCase(),
              "SI",
              date,
              e.final_result ?? "Pending",
              names.get(who) ?? "",
              e.application_id,
              e.id,
              finalAt ?? "",
              e.applications.country ?? "",
            ];
          });
        return Response.json({ rows, count: rows.length });
      },
    },
  },
});
