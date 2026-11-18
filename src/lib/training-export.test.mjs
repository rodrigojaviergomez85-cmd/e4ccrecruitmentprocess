import assert from "node:assert/strict";
import { trainingExportRows, TRAINING_EXPORT_COLUMNS } from "./training-export.ts";

const base = {
  fullName: "Ana López", email: "ana@example.com", phone: "+503 7000 0000", country: "El Salvador",
  lob: "SV", modality: "onsite", branch: "Zona 13", trainer: "Roberto Sánchez",
  agreedSchedule: "Lun-Vie 8am-5pm", waveStart: "2026-11-24", requestDate: "2026-11-10",
  hiringDate: "2026-12-01", status: "IN TRAINING", certification: "PENDIENTE",
  certificationReason: "", recruitmentApprovedAt: "2026-11-05", recruiter: "Morena",
  day1Followup: "confirmed", comments: "Sin novedad",
};

const [row] = trainingExportRows([base]);
assert.equal(row.nombre_completo, "Ana López");
assert.equal(row.modalidad, "PRESENCIAL");
assert.equal(row.inicio_wave, "2026-11-24");
assert.equal(row.reclutador, "Morena");
assert.equal(row.estado, "IN TRAINING");

const [online] = trainingExportRows([{ ...base, modality: "online", phone: null, waveStart: null }]);
assert.equal(online.modalidad, "ONLINE");
assert.equal(online.telefono, "");
assert.equal(online.inicio_wave, "");

assert.equal(TRAINING_EXPORT_COLUMNS.length, 19);
assert.equal(Object.keys(row).length, TRAINING_EXPORT_COLUMNS.length);

console.log("training-export tests OK");
