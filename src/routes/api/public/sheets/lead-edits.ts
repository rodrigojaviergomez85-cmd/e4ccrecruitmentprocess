import { createFileRoute } from "@tanstack/react-router";

import { LEAD_LOBS, LOB_SHEET, SHEET_COLUMNS, type LeadLob } from "@/lib/leads";

/**
 * Feed for the Apps Script write-back: leads edited in the platform since `since`.
 * Returns the tab, original row, email (to re-check the row) and 1-based column → value.
 * Protected by the SHEETS_SYNC_TOKEN bearer token.
 */
export const Route = createFileRoute("/api/public/sheets/lead-edits")({
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

        const sinceRaw = new URL(request.url).searchParams.get("since") ?? "";
        const since = Number.isNaN(Date.parse(sinceRaw)) ? "1970-01-01T00:00:00Z" : new Date(sinceRaw).toISOString();
        const now = new Date().toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const rows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        for (let from = 0; ; from += 1000) {
          const { data, error } = await db
            .from("recruitment_leads")
            .select("lob, source_row, email, filtro_lead, mensaje, msg_recruiter, msg_date, msg_time, llamada, call_recruiter, call_date, call_time, interview_result, comment")
            .gt("edited_in_app_at", since)
            .lte("edited_in_app_at", now)
            .order("edited_in_app_at", { ascending: true })
            .range(from, from + 999);
          if (error) return new Response(error.message, { status: 500 });
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }

        const edits = rows
          .filter((r) => (LEAD_LOBS as readonly string[]).includes(r.lob))
          .map((r) => {
            const c = SHEET_COLUMNS[r.lob as LeadLob];
            const cols: Record<number, string> = {
              [c.filtro + 1]: r.filtro_lead,
              [c.msgRec + 1]: r.msg_recruiter, [c.msgDate + 1]: r.msg_date, [c.msgTime + 1]: r.msg_time, [c.msg + 1]: r.mensaje,
              [c.callRec + 1]: r.call_recruiter, [c.callDate + 1]: r.call_date, [c.callTime + 1]: r.call_time, [c.call + 1]: r.llamada,
              [c.int + 1]: r.interview_result,
              [c.comment + 1]: r.comment,
            };
            return { sheet: LOB_SHEET[r.lob as LeadLob], row: r.source_row, email: r.email, emailCol: c.email + 1, cols };
          });
        return Response.json({ now, edits });
      },
    },
  },
});
