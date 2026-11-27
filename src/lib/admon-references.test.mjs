import { test, expect } from "bun:test";
import { admonReferencesInput, mergeAdmonReferences } from "./admon-references.ts";
const id = "0b1f7bed-29f1-4750-aef3-c20fd939d891";
test("references can be added after an imported approval without answers", () => {
  const reference = { company: "Empresa", boss: "Contacto", phone: "+505 88888888" };
  expect(admonReferencesInput.parse({ id, references: [reference], calls: [{ result: "Pendiente", comment: "" }] }).references).toEqual([reference]);
});
test("editing contacts preserves historical reference notes and score", () => {
  expect(mergeAdmonReferences([{ score: 9, notes: "Historial", boss: "Anterior" }], [{ company: "Empresa", boss: "Contacto", phone: "88888888" }])).toEqual([{ score: 9, notes: "Historial", company: "Empresa", boss: "Contacto", phone: "88888888" }]);
});
test("each new reference keeps its matching call", () => {
  expect(() => admonReferencesInput.parse({ id, references: [{ company: "", boss: "Contacto", phone: "" }], calls: [] })).toThrow();
});