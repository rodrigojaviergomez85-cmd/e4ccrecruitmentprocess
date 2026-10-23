/**
 * Leads module rules. Original sheet values are always stored verbatim; groups
 * only drive filters and metrics. Four independent fields per lead:
 * Filtro lead, Mensaje enviado, Resultado de llamada, Resultado de entrevista.
 */

export const LEAD_LOBS = ["ONLINE", "SV", "NICA", "GT"] as const;
export type LeadLob = (typeof LEAD_LOBS)[number];
export const LOB_LABEL: Record<LeadLob, string> = { ONLINE: "ONLINE", SV: "EL SALVADOR", NICA: "NICARAGUA", GT: "GUATEMALA" };
export const LOB_SHEET: Record<LeadLob, string> = { ONLINE: "LEADS ONLINE", SV: "SV", NICA: "NICA", GT: "GT" };
/** Tab gids for the native CSV export (gviz drops numbers in mixed-type columns like TELEFONO). */
export const LOB_GID: Record<LeadLob, string> = { ONLINE: "140927548", SV: "864557103", NICA: "2018809868", GT: "348099479" };

/** 0-indexed sheet columns. GT/SV/NICA: O,S,W,Y. LEADS ONLINE: Q,U,Y,AA. */
const COUNTRY_COLS = { created: 0, country: -1, branch: 4, teachTime: 5, teachExp: 6, ccTime: 7, ccExp: 8, birth: 9, age: 10, email: 11, name: 12, phone: 13, filtro: 14, msgRec: 15, msgDate: 16, msgTime: 17, msg: 18, callRec: 19, callDate: 20, callTime: 21, call: 22, intDate: 23, int: 24, comment: 25 };
export const SHEET_COLUMNS: Record<LeadLob, typeof COUNTRY_COLS> = {
  GT: COUNTRY_COLS,
  SV: COUNTRY_COLS,
  NICA: COUNTRY_COLS,
  ONLINE: { created: 0, country: 5, branch: 6, teachTime: 7, teachExp: 8, ccTime: 9, ccExp: 10, birth: 11, age: 12, email: 13, name: 14, phone: 15, filtro: 16, msgRec: 17, msgDate: 18, msgTime: 19, msg: 20, callRec: 21, callDate: 22, callTime: 23, call: 24, intDate: 25, int: 26, comment: 27 },
};

export type LeadField = "filtro_lead" | "mensaje" | "llamada" | "interview_result";

/** Dropdown options per LOB, exactly as they exist in each tab. */
export const CATALOG: Record<LeadLob, Record<LeadField, string[]>> = {
  GT: {
    filtro_lead: ["APPROVED", "NOT APPROVED", "DUPLICATED", "BLACKLISTED", "NO RECONTRATABLE"],
    mensaje: ["MENSAJE DE BIENVENIDA", "OPEN HOUSE INVITE", "MENSAJE DE SEGUIMIENTO 3", "SIN WHATSAPP", "PRUEBA APP"],
    llamada: ["APPROVED", "NOT APPROVED", "NO ANSWER", "NO INTERESADO", "OFFLINE", "CALL BACK", "NO DISPONIBILIDAD", "NO RECONTRATABLE", "ONLINE", "NUMERO INCORRECTO", "COLGÓ", "WAITING LIST"],
    interview_result: ["APPROVED", "NOT APPROVED", "RETAKE", "BLACKLISTED"],
  },
  SV: {
    filtro_lead: ["APPROVED", "NOT APPROVED", "DUPLICATED", "NO RECONTRATABLE"],
    mensaje: ["MENSAJE DE BIENVENIDA", "MENSAJE DE OPEN HOUSE", "OPEN HOUSE INVITE", "MENSAJE DE SEGUIMIENTO", "SIN WHATSAPP", "NO RECONTRATABLE"],
    llamada: ["APPROVED", "NOT APPROVED", "NO ANSWER", "OFFLINE NUMBER", "NO INTERESADO / HUNG UP", "NOT INTERESTED", "NOT AVAILABILITY", "WAITING LIST", "ONLINE", "CALL BACK", "COLGO", "WRONG NUMBER", "NO RECONTRATABLE", "DUPLICADA", "BLACKLISTED"],
    interview_result: ["APPROVED", "NOT APPROVED", "RETAKE", "BLACKLISTED", "NOT INTERESTED", "WAITING LIST", "COLGO", "NO RECONTRATABLE"],
  },
  NICA: {
    filtro_lead: ["APPROVED", "NOT APPROVED", "DUPLICATED", "NO RECONTRATABLE"],
    mensaje: ["MENSAJE DE BIENVENIDA", "MENSAJE DE OPEN HOUSE", "MENSAJE DE SEGUIMIENTO", "SIN WHATSAPP", "PRUEBA APP"],
    llamada: ["OPEN HOUSE INVITE", "APPROVED", "NOT APPROVED", "NO ANSWER", "NOT INTERESTED / HUNG UP", "OFFLINE", "NOT AVAILABILITY", "ONLINE", "NO RECONTRATABLE"],
    interview_result: ["APPROVED", "NOT APPROVED", "RETAKE", "NO RECONTRATABLE"],
  },
  ONLINE: {
    filtro_lead: ["APPROVED", "NOT APPROVED", "DUPLICATED", "OVERAGE", "NO RECONTRATABLE", "BLACKLISTED", "BLACK LISTED"],
    mensaje: ["MENSAJE DE BIENVENIDA", "MENSAJE DE OPEN HOUSE", "MENSAJE DE SEGUIMIENTO", "SIN WHATSAPP", "PRUEBA WEBSITE", "BLACKLISTED", "NO RECONTRATABLE", "DUPLICADA"],
    llamada: ["APPROVED", "NOT APPROVED", "NO ANSWER", "NOT INTERESTED", "NOT AVAILABILITY", "OPEN HOUSE INVITE", "CALENDLY", "AGENDA POR MEDIO DE CALENDLY", "WAITING LIST", "NO EQUIPMENT", "NO RECONTRATABLE", "BLACKLISTED", "BLACK LISTED", "OVERAGED", "COLGO", "CALL DISCONNECTED", "DUPLICADA", "RETAKE"],
    interview_result: ["APPROVED", "NOT APPROVED", "RETAKE", "NOT INTERESTED", "NO ANSWER", "NOT AVAILABILITY", "NO AVAILABILITY", "NO RECONTRATABLE", "BLACKLISTED", "BLACK LISTED", "DUPLICADO", "OPEN HOUSE INVITE"],
  },
};

/** One group per item: equivalent spellings share a group, original text is kept. */
const GROUPS: Array<[string, string[]]> = [
  ["Aprobado", ["APPROVED"]],
  ["No aprobado", ["NOT APPROVED"]],
  ["Retake", ["RETAKE"]],
  ["Duplicado", ["DUPLICATED", "DUPLICADA", "DUPLICADO"]],
  ["Lista negra", ["BLACKLISTED", "BLACK LISTED"]],
  ["No recontratable", ["NO RECONTRATABLE"]],
  ["Sobre edad", ["OVERAGE", "OVERAGED"]],
  ["No contesta", ["NO ANSWER"]],
  ["No interesado", ["NO INTERESADO", "NOT INTERESTED", "NO INTERESADO / HUNG UP", "NOT INTERESTED / HUNG UP"]],
  ["Colgó / se cortó", ["COLGO", "COLGÓ", "CALL DISCONNECTED"]],
  ["Sin disponibilidad", ["NO DISPONIBILIDAD", "NOT AVAILABILITY", "NO AVAILABILITY"]],
  ["Número fuera de servicio", ["OFFLINE", "OFFLINE NUMBER"]],
  ["Número incorrecto", ["NUMERO INCORRECTO", "WRONG NUMBER"]],
  ["Volver a llamar", ["CALL BACK"]],
  ["Lista de espera", ["WAITING LIST"]],
  ["Derivado a Online", ["ONLINE"]],
  ["Sin equipo", ["NO EQUIPMENT"]],
  ["Agendado (Calendly)", ["CALENDLY", "AGENDA POR MEDIO DE CALENDLY"]],
  ["Invitación Open House", ["OPEN HOUSE INVITE", "MENSAJE DE OPEN HOUSE"]],
  ["Bienvenida", ["MENSAJE DE BIENVENIDA"]],
  ["Seguimiento", ["MENSAJE DE SEGUIMIENTO", "MENSAJE DE SEGUIMIENTO 3"]],
  ["Sin WhatsApp", ["SIN WHATSAPP"]],
  ["Prueba", ["PRUEBA APP", "PRUEBA WEBSITE"]],
];
const GROUP_OF = new Map<string, string>(GROUPS.flatMap(([g, vs]) => vs.map((v) => [v, g] as [string, string])));
export const valueGroup = (v: string) => (v.trim() ? (GROUP_OF.get(v.trim().toUpperCase()) ?? "Otro") : "");

/** Call-field values that are NOT a call made: Open House invites and Calendly self-booking. */
const NOT_A_CALL = new Set(["Invitación Open House", "Agendado (Calendly)", "Duplicado"]);
/** Call results where nobody was reached. */
const NOT_CONNECTED = new Set(["No contesta", "Número fuera de servicio", "Número incorrecto", "Volver a llamar", "Colgó / se cortó"]);

export const isCallMade = (llamada: string) => !!llamada.trim() && !NOT_A_CALL.has(valueGroup(llamada));
export const isCallConnected = (llamada: string) => isCallMade(llamada) && !NOT_CONNECTED.has(valueGroup(llamada));
export const isCalendlyScheduled = (llamada: string) => valueGroup(llamada) === "Agendado (Calendly)";
export const isOpenHouseInvite = (llamada: string) => valueGroup(llamada) === "Invitación Open House";

/** Approval filters offered on the Leads screen ("solo los APPROVED"). */
export const APPROVAL_STAGES = ["filtro", "llamada", "entrevista", "avance", "filtro_y_llamada"] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];
export type ApprovalFilter = "ALL" | ApprovalStage;
export const APPROVAL_LABEL: Record<ApprovalFilter, string> = {
  ALL: "Todas",
  filtro: "Aprobadas en filtro",
  llamada: "Aprobadas en llamada",
  entrevista: "Aprobadas en entrevista (hoja)",
  avance: "Avanzaron a último filtro",
  filtro_y_llamada: "Aprobadas en filtro y llamada",
};

/**
 * Approval per stage, group-based so equivalent spellings count together.
 * "Approved for last step" is advance to the final filter, never an interview approval.
 */
export function isApprovedAt(row: LeadMetricRow, stage: ApprovalStage): boolean {
  switch (stage) {
    case "filtro":
      return valueGroup(row.filtro_lead) === "Aprobado";
    case "llamada":
      return valueGroup(row.llamada) === "Aprobado";
    case "entrevista":
      return valueGroup(row.interview_result) === "Aprobado";
    case "avance":
      return row.lovable?.result === "Approved for last step";
    case "filtro_y_llamada":
      return isApprovedAt(row, "filtro") && isApprovedAt(row, "llamada");
  }
}

export const matchesApproval = (row: LeadMetricRow, filter: ApprovalFilter) =>
  filter === "ALL" || isApprovedAt(row, filter);

export type LeadMetricRow = {
  lead_created_at: string | null;
  msg_at: string | null;
  call_at: string | null;
  filtro_lead: string;
  mensaje: string;
  llamada: string;
  msg_recruiter: string;
  call_recruiter: string;
  interview_result: string;
  lovable?: { interviewed_at: string | null; result: string | null; appointment_at: string | null } | null;
};

const inRange = (iso: string | null, from: number, to: number) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= from && t < to;
};

/**
 * Weekly funnel. Filter/received use the lead date, messages the message date,
 * calls the call date, interviews the Lovable interview date (sheet results have
 * no reliable date and are counted by lead date). "Approved for last step" is
 * reported as advance to the final filter, never as hire.
 */
export function weeklyMetrics(rows: LeadMetricRow[], from: number, to: number) {
  const m = {
    received: 0, filterApproved: 0, messages: 0, calls: 0, connected: 0, callApproved: 0,
    openHouse: 0, calendly: 0, interviews: 0, interviewApproved: 0, lastStep: 0, retake: 0,
    byRecruiter: {} as Record<string, { messages: number; calls: number; connected: number; callApproved: number }>,
  };
  const rec = (name: string) => {
    const k = canonicalRecruiter(name) || "Sin reclutador";
    return (m.byRecruiter[k] ??= { messages: 0, calls: 0, connected: 0, callApproved: 0 });
  };
  for (const r of rows) {
    if (inRange(r.lead_created_at, from, to)) {
      m.received++;
      if (valueGroup(r.filtro_lead) === "Aprobado") m.filterApproved++;
    }
    if (r.mensaje.trim() && inRange(r.msg_at, from, to)) { m.messages++; rec(r.msg_recruiter).messages++; }
    if (inRange(r.call_at, from, to)) {
      if (isOpenHouseInvite(r.llamada)) m.openHouse++;
      if (isCalendlyScheduled(r.llamada)) m.calendly++;
      if (isCallMade(r.llamada)) {
        m.calls++; rec(r.call_recruiter).calls++;
        if (isCallConnected(r.llamada)) { m.connected++; rec(r.call_recruiter).connected++; }
        if (valueGroup(r.llamada) === "Aprobado") { m.callApproved++; rec(r.call_recruiter).callApproved++; }
      }
    }
    const lov = r.lovable;
    if (lov?.interviewed_at && inRange(lov.interviewed_at, from, to)) {
      m.interviews++;
      if (lov.result === "Approved for last step") m.lastStep++;
      if (lov.result === "Retake required") m.retake++;
    } else if (!lov?.interviewed_at && r.interview_result.trim() && inRange(r.lead_created_at, from, to)) {
      m.interviews++;
      const g = valueGroup(r.interview_result);
      if (g === "Aprobado") m.interviewApproved++;
      if (g === "Retake") m.retake++;
    }
  }
  return m;
}

/** Sheet recruiter spellings → one name; unknown values stay as written. */
export function canonicalRecruiter(raw: string) {
  const v = raw.trim().toUpperCase();
  if (!v) return "";
  if (v.startsWith("MORENA")) return "MORENA LEMUS";
  if (v.startsWith("KENNIA") || v.startsWith("KENIA")) return "KENNIA VASQUEZ";
  return v;
}

/** Parses the sheet's D/M/YYYY date (+ optional "h:mm:ss a.m.") as El Salvador time (UTC-6). */
export function parseSheetDateTime(date: string, time = ""): string | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  if (!d) return null;
  let h = 12, min = 0;
  const t = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s*m\.?$/i.exec(time.trim());
  if (t) {
    h = Number(t[1]) % 12 + ((t[3] ?? "").toLowerCase() === "p" ? 12 : 0);
    min = Number(t[2]);
  }
  const ms = Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1]), h + 6, min);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Monday 00:00 El Salvador of the week containing `ms`, as UTC ms. */
export function weekStart(ms: number) {
  const sv = new Date(ms - 6 * 3600_000);
  const day = (sv.getUTCDay() + 6) % 7;
  return Date.UTC(sv.getUTCFullYear(), sv.getUTCMonth(), sv.getUTCDate() - day) + 6 * 3600_000;
}

/** Minimal RFC4180 CSV parser (quoted fields, escaped quotes, newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Country code for the applicant form from a lead (ONLINE uses the country the lead typed). */
export function leadCountryCode(lob: LeadLob, leadCountry: string | null, phone: string | null = null): string {
  if (lob === "SV") return "SV";
  if (lob === "GT") return "GT";
  if (lob === "NICA") return "NI";
  const c = (leadCountry ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const map: Record<string, string> = { "el salvador": "SV", guatemala: "GT", nicaragua: "NI", honduras: "HN", mexico: "MX", colombia: "CO" };
  if (map[c]) return map[c];
  const d = (phone ?? "").replace(/\D/g, "");
  const byDial: [string, string][] = [["503", "SV"], ["502", "GT"], ["505", "NI"], ["504", "HN"], ["57", "CO"], ["52", "MX"]];
  return byDial.find(([p]) => d.startsWith(p) && d.length >= p.length + 7)?.[1] ?? "OTHER";
}

/** Local phone digits without the country dial prefix. */
export function stripDial(phone: string | null, dial: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const d = dial.replace(/\D/g, "");
  return d && digits.startsWith(d) && digits.length > d.length + 6 ? digits.slice(d.length) : digits;
}

/** Age text from the sheet, or computed from the birth date's 4-digit year when the formula cell is still empty. */
export function leadAge(age: string, birth: string, now = new Date()): string {
  if (age.trim()) return age.trim();
  const y = /(19|20)\d{2}/.exec(birth)?.[0];
  if (!y) return "";
  const a = now.getUTCFullYear() - Number(y);
  return a > 10 && a < 100 ? `~${a} años` : "";
}
