import { test, expect } from "bun:test";
import { mapAdmonLead, sheetTimestamp, deduplicateAdmonLeads, existingAdmonCandidate, cleanLeadSearch } from "./admon-leads.ts";
test("email search preserves dots and at signs", () => expect(cleanLeadSearch(" example.name@test.com ")).toBe("example.name@test.com"));
const row = () => { const r = Array(42).fill(""); r[0] = "26/11/2026 11:48:23"; r[12] = "Persona Ejemplo"; r[13] = "+505 88888888"; r[14] = "EXAMPLE@TEST.COM"; return r; };
test("sales sheet maps age, experience, CV and original filter separately", () => {
  const r = row(); r[1] = "NO APROBADO"; r[3] = "NO ENTREVISTADO"; r[25] = "20-25 años"; r[26] = "2 años o más"; r[27] = "Ventas y atención"; r[11] = "https://drive.google.com/open?id=example";
  expect(mapAdmonLead(r, 2)).toMatchObject({ position: "AGENTE DE VENTAS", age: "20-25 años", experience_time: "2 años o más", experience: "Ventas y atención", cv_filter: "NO APROBADO", contact_status: "NO ENTREVISTADO", email: "example@test.com" });
});
test("sales sheet timestamps use UTC-6 and full time", () => expect(sheetTimestamp("26/11/2026 11:48:23")).toBe("2026-11-26T17:48:23.000Z"));
test("pre-filled empty rows are not leads", () => { const r = Array(42).fill(""); r[3] = "NO ENTREVISTADO"; expect(mapAdmonLead(r, 3)).toBeNull(); });
test("new vacancies retain their own position", () => { const r = row(); r[24] = "MANTENIMIENTO"; expect(mapAdmonLead(r, 4)?.position).toBe("MANTENIMIENTO"); });
test("latest submission wins for repeated email and same position", () => {
  const a = mapAdmonLead(row(), 2); if (!a) throw new Error("fixture missing");
  expect(deduplicateAdmonLeads([a, { ...a, source_row: 3, submitted_at: "2026-11-27T17:00:00.000Z" }])).toHaveLength(1);
  expect(deduplicateAdmonLeads([a, { ...a, source_row: 3, submitted_at: "2026-11-27T17:00:00.000Z" }])[0]?.source_row).toBe(3);
});
test("screening reuses existing same-position candidate by normalized email", () => {
  expect(existingAdmonCandidate([{ id: "existing", email: "Example@Test.com", phone: "", position: "AGENTE DE VENTAS" }], { email: " example@test.com ", phone: "", position: "AGENTE DE VENTAS" })?.id).toBe("existing");
});
test("different position does not reuse an unrelated process", () => {
  expect(existingAdmonCandidate([{ id: "existing", email: "example@test.com", phone: "", position: "MANTENIMIENTO" }], { email: "example@test.com", phone: "", position: "AGENTE DE VENTAS" })).toBeUndefined();
});