import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { publicStatus, normalizeEmail } from "./referrals.ts";

describe("Referral public status", () => {
  test("unlinked referral reads Recibido", () => {
    assert.equal(publicStatus({ linked: false, appStatus: "Approved for Training" }), "Recibido");
  });
  test("closures never reveal the reason", () => {
    assert.equal(publicStatus({ linked: true, appStatus: "Not Approved – Manager Final Filter" }), "Proceso finalizado");
    assert.equal(publicStatus({ linked: true, appStatus: "No Show – Manager Final Filter" }), "Proceso finalizado");
    assert.equal(publicStatus({ linked: true, appStatus: "Approved for Training", trainingStatus: "DROP OUT DURING TRAINING" }), "Proceso finalizado");
  });
  test("training progress wins over application status", () => {
    assert.equal(publicStatus({ linked: true, appStatus: "Approved for Training", trainingStatus: "CERTIFIED" }), "Certificado");
    assert.equal(publicStatus({ linked: true, appStatus: "Approved for Training", trainingStatus: "IN TRAINING" }), "En training");
  });
  test("pipeline stages", () => {
    assert.equal(publicStatus({ linked: true, appStatus: "Retake – Email Sent" }), "Retake pendiente");
    assert.equal(publicStatus({ linked: true, appStatus: "Pending Second Filter" }), "En evaluación");
    assert.equal(publicStatus({ linked: true, appStatus: "new", hasActiveAppointment: true }), "Entrevista pendiente");
    assert.equal(publicStatus({ linked: true, appStatus: "new" }), "En contacto");
  });
  test("emails are normalized", () => {
    assert.equal(normalizeEmail("  Ana.Lopez@Gmail.com "), "ana.lopez@gmail.com");
  });
});
