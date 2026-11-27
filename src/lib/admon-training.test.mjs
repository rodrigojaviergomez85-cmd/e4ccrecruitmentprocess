import { test, expect } from "bun:test";
import { approvedForAdmonTraining, validateTrainingStatus, ADMON_DOCUMENTS, preparationBlocked, referenceProgress } from "./admon-training.ts";
const approved = { stage: "hired", screening_decision: "Pasa", operations_decision: "Pasa", technical_decision: "Pasa" };
test("Training ADMON requires all three interviews approved", () => {
  expect(approvedForAdmonTraining(approved)).toBe(true);
  for (const key of ["screening_decision", "operations_decision", "technical_decision"]) expect(approvedForAdmonTraining({ ...approved, [key]: null })).toBe(false);
  expect(approvedForAdmonTraining({ ...approved, stage: "operations" })).toBe(false);
});
test("Dropout requires a reason", () => { expect(() => validateTrainingStatus("dropout", " ")).toThrow(); expect(() => validateTrainingStatus("dropout", "No puede continuar")).not.toThrow(); });
test("SV requires the two independent clearances", () => { expect(ADMON_DOCUMENTS["EL SALVADOR"]).toEqual(["DUI por ambos lados", "Título de bachillerato", "Antecedentes Penales", "Solvencia Policial"]); });
test("GT retains three clearances and RTU", () => { expect(ADMON_DOCUMENTS["GUATEMALA"]).toEqual(["DPI por ambos lados", "Título de nivel medio", "RTU", "Antecedentes Policíacos", "Antecedentes Judiciales", "RENAS"]); });
test("NI includes health and conduct certificates", () => { expect(ADMON_DOCUMENTS["NICARAGUA"]).toEqual(["Cédula por ambos lados", "Título de bachillerato", "Certificado de Salud", "Certificado de Conducta"]); });
test("accepted and requesting prevent repeat requests", () => { expect(preparationBlocked("accepted")).toBe(true); expect(preparationBlocked("requesting")).toBe(true); expect(preparationBlocked("sent")).toBe(true); expect(preparationBlocked("failed")).toBe(false); });
test("reference attempts do not count as completed reference conversations", () => { expect(referenceProgress([{}, {}, {}], [{ result: "Positiva" }, { result: "No contestó" }, { result: "Negativa" }])).toEqual({ done: 2, total: 3 }); });
