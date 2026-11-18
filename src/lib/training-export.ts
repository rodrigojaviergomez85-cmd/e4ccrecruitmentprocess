/** Pure rules for the Training Tracker CSV export (no I/O). */

export const TRAINING_EXPORT_COLUMNS = [
  "nombre_completo", "correo", "telefono", "pais", "lob", "modalidad", "sucursal", "trainer",
  "horario_acordado", "inicio_wave", "request_date", "fecha_contratacion", "estado",
  "certificacion", "motivo_certificacion", "aprobado_reclutamiento", "reclutador",
  "seguimiento_dia_1", "comentarios",
] as const;

export type TrainingExportRow = Record<(typeof TRAINING_EXPORT_COLUMNS)[number], string>;

interface RosterRowLike {
  fullName: string;
  email: string;
  phone: string | null;
  country: string | null;
  lob: string;
  modality: string | null;
  branch: string | null;
  trainer: string;
  agreedSchedule: string;
  waveStart: string | null;
  requestDate: string | null;
  hiringDate: string | null;
  status: string;
  certification: string;
  certificationReason: string;
  recruitmentApprovedAt: string | null;
  recruiter: string;
  day1Followup: string;
  comments: string;
}

export function trainingExportRows(rows: RosterRowLike[]): TrainingExportRow[] {
  return rows.map((r) => ({
    nombre_completo: r.fullName,
    correo: r.email,
    telefono: r.phone ?? "",
    pais: r.country ?? "",
    lob: r.lob,
    modalidad: r.modality === "online" ? "ONLINE" : r.modality === "onsite" ? "PRESENCIAL" : "",
    sucursal: r.branch ?? "",
    trainer: r.trainer,
    horario_acordado: r.agreedSchedule,
    inicio_wave: r.waveStart ?? "",
    request_date: r.requestDate ?? "",
    fecha_contratacion: r.hiringDate ?? "",
    estado: r.status,
    certificacion: r.certification,
    motivo_certificacion: r.certificationReason,
    aprobado_reclutamiento: r.recruitmentApprovedAt ?? "",
    reclutador: r.recruiter,
    seguimiento_dia_1: r.day1Followup,
    comentarios: r.comments,
  }));
}
