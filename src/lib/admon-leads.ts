/** Original ADMON sheet values stay verbatim; only identity is normalized. */
export const ADMON_LEADS_SHEET = "1L53_tnU0loOgfgcx-Q90-IAdsNB57oUO-OvaJnFKBM8";
export const ADMON_LEADS_TAB = "LEADS AGENTE DE VENTAS ";
export const ADMON_LEADS_GID = "690103177";

export function cleanLeadSearch(search: string) { return search.replace(/[%_,()\\]/g, " ").trim(); }

export function sheetTimestamp(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]) + 6, Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function safeLink(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
}

export function mapAdmonLead(row: string[], sourceRow: number) {
  const g = (i: number) => (row[i] ?? "").trim();
  if (!g(12) || (!g(13) && !g(14))) return null;
  const email = g(14).toLowerCase();
  const phone = g(13);
  const position = g(23) || g(24) || g(33) || "AGENTE DE VENTAS";
  return {
    source_key: JSON.stringify([email || phone.replace(/\D/g, ""), position]), source_row: sourceRow,
    full_name: g(12), email, phone, country: g(22), branch: g(9) || g(10), position,
    cv_link: safeLink(g(15)) || safeLink(g(11)), video_link: safeLink(g(32)) || safeLink(g(16)), presentation_link: safeLink(g(30)),
    age: g(25), experience_time: g(31) || g(26), experience: g(27),
    cv_filter: g(1), contact_status: g(3), comments: [g(7), g(38)].filter(Boolean).join("\n"), submitted_at: sheetTimestamp(g(0)),
  };
}

/** Latest application per email+position, without inventing identities for empty emails. */
export function deduplicateAdmonLeads<T extends { email: string; source_key: string; position: string; submitted_at: string | null }>(leads: T[]): T[] {
  const unique = new Map<string, T>();
  for (const lead of leads) {
    const key = lead.email ? `${lead.email.trim().toLowerCase()}|${lead.position}` : lead.source_key;
    const old = unique.get(key);
    if (!old || (lead.submitted_at ?? "") >= (old.submitted_at ?? "")) unique.set(key, lead);
  }
  return [...unique.values()];
}

export function existingAdmonCandidate<T extends { id: string; email: string; phone: string; position: string }>(candidates: T[], lead: { email: string; phone: string; position: string }) {
  return candidates.find((c) => c.position === lead.position && (
    lead.email ? c.email.trim().toLowerCase() === lead.email.trim().toLowerCase() : !!lead.phone && c.phone.replace(/\D/g, "") === lead.phone.replace(/\D/g, "")
  ));
}