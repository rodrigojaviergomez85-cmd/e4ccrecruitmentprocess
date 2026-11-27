export const TRAINING_STATES = { pending: "Pendiente de iniciar", in_training: "En Training", dropout: "Dropout", completed: "Training completado" } as const;
export type AdmonTrainingStatus = keyof typeof TRAINING_STATES;
export function approvedForAdmonTraining(c: { stage: string; screening_decision: string | null; operations_decision: string | null; technical_decision: string | null }) {
  return c.stage === "hired" && c.screening_decision === "Pasa" && c.operations_decision === "Pasa" && c.technical_decision === "Pasa";
}
export function validateTrainingStatus(status: AdmonTrainingStatus, comment: string) {
  if (status === "dropout" && !comment.trim()) throw new Error("Indica el motivo del Dropout.");
}
export const ADMON_DOCUMENTS: Record<string, string[]> = {
  "EL SALVADOR": ["DUI por ambos lados", "Título de bachillerato", "Antecedentes Penales", "Solvencia Policial"],
  "GUATEMALA": ["DPI por ambos lados", "Título de nivel medio", "RTU", "Antecedentes Policíacos", "Antecedentes Judiciales", "RENAS"],
  "NICARAGUA": ["Cédula por ambos lados", "Título de bachillerato", "Certificado de Salud", "Certificado de Conducta"],
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
export function buildAdmonPreparationEmail(fullName: string, country: string) {
  const documents = ADMON_DOCUMENTS[country];
  if (!documents) throw new Error("Confirma el país y sus documentos antes de enviar el correo.");
  return {
    subject: "E4CC — Proceso de entrevistas completado y preparación de documentos",
    html: `<h2>Hola, ${escapeHtml(fullName)}</h2><p>¡Gracias por culminar tu proceso de entrevistas con E4CC!</p><p>Has finalizado exitosamente las tres entrevistas. El equipo de Reclutamiento se encuentra hoy realizando las llamadas de referencias laborales. Por favor, avisa a tus referencias que les estaremos llamando.</p><p>Prepara la siguiente documentación a presentar para ${escapeHtml(country)}:</p><ul>${documents.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul><p>El equipo de Reclutamiento te confirmará los detalles de presentación y el inicio de Training.</p><p>Saludos,<br>Equipo de Reclutamiento E4CC</p>`,
  };
}
export function preparationBlocked(status: string | null | undefined) { return status === "requesting" || status === "accepted" || status === "sent"; }
export function referenceProgress(references: unknown[], calls: { result: string }[]) {
  return { total: references.length, done: references.filter((_, i) => calls[i]?.result === "Positiva" || calls[i]?.result === "Negativa").length };
}
