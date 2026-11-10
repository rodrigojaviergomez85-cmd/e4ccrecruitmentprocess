/** Pure rules for the interview CSV export (no I/O). */

export const EXPORT_COLUMNS = [
  "evaluation_id", "application_id", "event_id", "fecha_entrevista", "submitted_at", "nombre_completo",
  "correo", "telefono", "pais", "modalidad", "sucursal", "resultado", "razon_no_aprobado",
  "entrevistador", "origen_lead", "es_prueba",
] as const;
export type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string>;

export const COUNTRY_NAMES_ES: Record<string, string> = {
  SV: "El Salvador", GT: "Guatemala", NI: "Nicaragua", HN: "Honduras", CO: "Colombia", MX: "México", OTHER: "Otro",
};

/** Country implied by a phone's international prefix, or null when it cannot be told. */
export function countryFromPhone(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (/^502\d{8}$/.test(d)) return "GT";
  if (/^503\d{8}$/.test(d)) return "SV";
  if (/^504\d{8}$/.test(d)) return "HN";
  if (/^505\d{8}$/.test(d)) return "NI";
  if (/^52\d{10}$/.test(d)) return "MX";
  if (/^57\d{10}$/.test(d)) return "CO";
  return null;
}

export function exportResult(finalResult: string | null | undefined, status?: string | null): string {
  if (status === "submitted" || finalResult) {
    if (finalResult === "Approved for last step" || finalResult === "Not approved" || finalResult === "Retake required") return finalResult;
  }
  return "Pending";
}

export function exportModality(lob: string | null | undefined): "ONLINE" | "PRESENCIAL" | "" {
  const v = String(lob ?? "").trim().toLowerCase();
  if (v === "online") return "ONLINE";
  if (v === "onsite" || v === "presencial") return "PRESENCIAL";
  return "";
}

/** Missing mandatory data that makes an interview incomplete. */
export function missingInterviewData(i: { countryCode: string | null | undefined; lob: string | null | undefined; branch: string | null | undefined }): string[] {
  const m: string[] = [];
  if (!String(i.countryCode ?? "").trim()) m.push("Country");
  const mod = exportModality(i.lob);
  if (!mod) m.push("Modality");
  if (mod === "PRESENCIAL" && !String(i.branch ?? "").trim()) m.push("Branch");
  return m;
}

/** Cell value safe for CSV: never error placeholders, quoted when needed. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v).trim();
  if (/^(#N\/A|#VALUE!|-|null|undefined)$/i.test(s)) s = "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(","), ...rows.map((r) => EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(","))];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function isTestEmail(email: string, teamEmails: string[] = []): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith("@e4ccglobal.com") || teamEmails.map((x) => x.trim().toLowerCase()).includes(e);
}
