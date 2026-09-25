import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AGREEMENT_TEMPLATES, type AgreementBlock } from "./templates.data";

import {
  AGREEMENT_TEMPLATE_VERSION,
  ONSITE_TRAINING_HOURS,
  ONSITE_HOURS_PENDING_TEXT,
  ONLINE_FIXED,
} from "./constants";
export * from "./constants";

export type AgreementKind = "online" | "onsite";
export type AgreementData = {
  fullName: string;
  startDate: string;
  trainer: string;
  // Onsite only
  trainingSchedule?: string;
  lob?: string;
  trainingBranch?: string;
  classBranch?: string;
  classSchedule?: string;
};

export function missingAgreementFields(kind: AgreementKind, d: AgreementData): string[] {
  const req: [keyof AgreementData, string][] = [
    ["fullName", "Nombre completo"],
    ["startDate", "Fecha de inicio de Training"],
    ["trainer", "Trainer"],
  ];
  if (kind === "onsite") {
    req.push(
      ["trainingSchedule", "Días y horario de Training"],
      ["lob", "LOB / tipo de plaza"],
      ["trainingBranch", "Sucursal de Training"],
      ["classBranch", "Sucursal asignada para clases"],
      ["classSchedule", "Días y horario de clases"],
    );
  }
  return req.filter(([k]) => !String(d[k] ?? "").trim()).map(([, l]) => l);
}

const clean = (s: string) =>
  s.replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x00-\xFF–—“”‘’•…]/g, "");

function fill(text: string, kind: AgreementKind, d: AgreementData, allowPendingHours: boolean): string {
  const hours =
    ONSITE_TRAINING_HOURS === 40
      ? "cuarenta (40) horas"
      : ONSITE_TRAINING_HOURS === 50
        ? "cincuenta (50) horas"
        : allowPendingHours
          ? ONSITE_HOURS_PENDING_TEXT
          : "";
  if (text.includes("{{training_hours_text}}") && !hours) throw new Error("ONSITE_HOURS_PENDING");
  return text
    .replace(/\{\{full_name\}\}/g, d.fullName.trim())
    .replace(/\{\{training_schedule\}\}/g, (d.trainingSchedule ?? "").trim())
    .replace(/\{\{class_schedule\}\}/g, (d.classSchedule ?? "").trim())
    .replace(/\{\{training_hours_text\}\}/g, hours);
}

const ORANGE = rgb(0.93, 0.42, 0.13);
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.46);
const LINE = rgb(0.85, 0.85, 0.87);

export async function buildAgreementPdf(
  kind: AgreementKind,
  data: AgreementData,
  opts: { test?: boolean; allowPendingHours?: boolean } = {},
): Promise<Uint8Array> {
  const missing = missingAgreementFields(kind, data);
  if (missing.length) throw new Error(`AGREEMENT_MISSING:${missing.join(", ")}`);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Convenio E4CC – ${data.fullName}`);
  pdf.setAuthor("E4CC – English4CallCenters");
  pdf.setSubject(`${kind === "online" ? "Online" : "Onsite"} · plantilla ${AGREEMENT_TEMPLATE_VERSION}`);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 612, H = 792, M = 60, CW = W - M * 2;
  let page!: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ORANGE });
    page.drawText("E4CC", { x: M, y: H - 34, size: 11, font: bold, color: ORANGE });
    page.drawText(clean("English4CallCenters · Convenio " + (kind === "online" ? "Online" : "Onsite")), {
      x: M + 36, y: H - 34, size: 8.5, font: reg, color: MUTED,
    });
    if (opts.test) page.drawText("MUESTRA TEST – NO VÁLIDA", { x: W - M - 150, y: H - 34, size: 8.5, font: bold, color: ORANGE });
    y = H - 60;
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const words = clean(text).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const ensure = (h: number) => { if (y - h < M) newPage(); };
  const para = (text: string, o: { font?: PDFFont; size?: number; indent?: number; gap?: number; color?: ReturnType<typeof rgb>; bullet?: string } = {}) => {
    const font = o.font ?? reg, size = o.size ?? 9.5, indent = o.indent ?? 0, lh = size * 1.38;
    const lines = wrap(text, font, size, CW - indent);
    ensure(Math.min(lines.length, 2) * lh);
    lines.forEach((ln, i) => {
      ensure(lh);
      if (i === 0 && o.bullet) page.drawText(o.bullet, { x: M + indent - 10, y: y - size, size, font: reg, color: INK });
      page.drawText(ln, { x: M + indent, y: y - size, size, font, color: o.color ?? INK });
      y -= lh;
    });
    y -= o.gap ?? 4;
  };

  newPage();
  const blocks = AGREEMENT_TEMPLATES[kind] as AgreementBlock[];
  const title = blocks[0]?.x ?? "";
  para(title, { font: bold, size: 14, gap: 10 });

  // Participant block: compact data not present in the original clauses.
  const rows: [string, string][] = [
    ["Nombre completo", data.fullName],
    ["Fecha de inicio de Training", data.startDate],
    ["Trainer", data.trainer],
  ];
  if (kind === "online") {
    rows.push(
      ["Horario de Training", ONLINE_FIXED.training],
      ["Disponibilidad de clases", ONLINE_FIXED.classes],
      ["Clases", `${ONLINE_FIXED.fixedClass}; ${ONLINE_FIXED.extraClass}`],
    );
  } else {
    rows.push(
      ["LOB / tipo de plaza", data.lob ?? ""],
      ["Días y horario de Training", data.trainingSchedule ?? ""],
      ["Sucursal de Training", data.trainingBranch ?? ""],
      ["Sucursal asignada para clases", data.classBranch ?? ""],
      ["Días y horario de clases", data.classSchedule ?? ""],
    );
  }
  const labelW = 165;
  const rowH = rows.map(([, v]) => Math.max(1, wrap(v, reg, 9, CW - labelW - 16).length) * 12.5 + 8);
  const boxH = rowH.reduce((a, b) => a + b, 0) + 26;
  ensure(boxH);
  page.drawRectangle({ x: M, y: y - boxH, width: CW, height: boxH, borderColor: ORANGE, borderWidth: 1, color: rgb(1, 0.97, 0.94) });
  page.drawText("DATOS DEL PARTICIPANTE", { x: M + 10, y: y - 16, size: 8.5, font: bold, color: ORANGE });
  let ry = y - 26;
  rows.forEach(([l, v], i) => {
    page.drawText(clean(l), { x: M + 10, y: ry - 12, size: 9, font: bold, color: MUTED });
    wrap(v, reg, 9, CW - labelW - 16).forEach((ln, j) =>
      page.drawText(ln, { x: M + labelW, y: ry - 12 - j * 12.5, size: 9, font: reg, color: INK }),
    );
    ry -= rowH[i];
  });
  y -= boxH + 14;

  for (const b of blocks.slice(1)) {
    if (b.t === "table" && b.rows) {
      const cols = b.rows[0].length;
      const cw = CW / cols;
      for (const [ri, r] of b.rows.entries()) {
        const font = ri === 0 ? bold : reg;
        const cellLines = r.map((c) => wrap(fill(c, kind, data, !!opts.allowPendingHours), font, 8.5, cw - 10));
        const h = Math.max(...cellLines.map((l) => l.length)) * 11.5 + 8;
        ensure(h);
        if (ri === 0) page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: rgb(0.96, 0.96, 0.97) });
        page.drawLine({ start: { x: M, y: y - h }, end: { x: M + CW, y: y - h }, thickness: 0.5, color: LINE });
        cellLines.forEach((ls, ci) => ls.forEach((ln, li) =>
          page.drawText(ln, { x: M + ci * cw + 5, y: y - 12 - li * 11.5, size: 8.5, font, color: INK })));
        y -= h;
      }
      y -= 10;
      continue;
    }
    const text = fill(b.x ?? "", kind, data, !!opts.allowPendingHours);
    if (b.t === "h" || b.t === "b") {
      const big = /^(PARTE|ADDENDUM|DISPOSICIONES|CONVENIO)/.test(text);
      y -= big ? 8 : 3;
      ensure(40);
      para(text, { font: bold, size: big ? 11 : 10, color: big ? ORANGE : INK, gap: 5 });
    } else if (b.t === "li") {
      const d = b.d ?? 1;
      para(text, { indent: 14 + (d - 1) * 16, bullet: d > 1 ? "–" : "•", gap: 2 });
    } else if (b.t === "sig") {
      y -= 10;
      para(text, { font: text.startsWith("Nombre") ? bold : reg, size: 10.5, gap: 12 });
    } else {
      para(text, { gap: 6 });
    }
  }

  pages.forEach((p, i) =>
    p.drawText(`Página ${i + 1} de ${pages.length}`, { x: W - M - 60, y: 30, size: 8, font: reg, color: MUTED }),
  );
  return pdf.save();
}
