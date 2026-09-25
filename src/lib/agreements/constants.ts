/** Browser-safe agreement constants (no PDF library). */
export const AGREEMENT_TEMPLATE_VERSION = "2026-09";
export const AGREEMENT_TEMPLATE_FILES = {
  online: "CONVENIO ONLINE DE SERVICIOS PROFESIONALES DE COACHING ONLINE(1).docx",
  onsite: "CONVENIO 2026 ONSITE FULL-PARTIME YS(1).docx",
} as const;

/**
 * Onsite source says "cincuenta (40) horas". E4CC has not confirmed 40 or 50,
 * so real Onsite sends stay blocked until this is set. TEST samples may render
 * with the pending marker.
 */
export const ONSITE_TRAINING_HOURS: null | 40 | 50 = null;
export const ONSITE_HOURS_PENDING_TEXT = "[PENDIENTE DE CONFIRMAR: 40 o 50] horas";

export const ONLINE_FIXED = {
  training: "Lunes a viernes, 5:00–9:00 p. m. (UTC-6)",
  classes: "Lunes a viernes, 6:30–9:35 p. m. (UTC-6)",
  fixedClass: "Clase fija inicial: 8:05–9:35 p. m.",
  extraClass: "Clase adicional 6:30–8:00 p. m. según desempeño y demanda",
  timezone: "Hora de E4CC (UTC-6)",
} as const;

