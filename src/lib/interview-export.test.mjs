import { test } from "node:test";
import assert from "node:assert/strict";
import { countryFromPhone, exportResult, missingInterviewData, toCsv, csvCell, EXPORT_COLUMNS } from "./interview-export.ts";

test("phone prefixes map to countries", () => {
  assert.equal(countryFromPhone("+502 3450 2845"), "GT");
  assert.equal(countryFromPhone("503 7777 1234"), "SV");
  assert.equal(countryFromPhone("50499998888"), "HN");
  assert.equal(countryFromPhone("505 77780292"), "NI");
  assert.equal(countryFromPhone("525512345678"), "MX");
  assert.equal(countryFromPhone("573001234567"), "CO");
  assert.equal(countryFromPhone("77780292"), null);
});
test("unfinished interviews export as Pending", () => {
  assert.equal(exportResult(null, "in_progress"), "Pending");
  assert.equal(exportResult("Not approved", "submitted"), "Not approved");
});
test("onsite needs branch, online does not", () => {
  assert.deepEqual(missingInterviewData({ countryCode: "SV", lob: "onsite", branch: "" }), ["Branch"]);
  assert.deepEqual(missingInterviewData({ countryCode: "SV", lob: "online", branch: "" }), []);
  assert.deepEqual(missingInterviewData({ countryCode: null, lob: "", branch: "" }), ["Country", "Modality"]);
});
test("csv has BOM, exact headers and no error placeholders", () => {
  const csv = toCsv([Object.fromEntries(EXPORT_COLUMNS.map((c) => [c, c === "telefono" ? "#N/A" : "x"]))]);
  assert.ok(csv.startsWith("\uFEFFevaluation_id,application_id,event_id,fecha_entrevista,submitted_at,nombre_completo,correo,telefono,pais,modalidad,sucursal,resultado,razon_no_aprobado,entrevistador,origen_lead,es_prueba\r\n"));
  assert.equal(csvCell("-"), "");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
});
