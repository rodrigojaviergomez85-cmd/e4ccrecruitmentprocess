import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateContactSchema, canEditInterviewContact } from "./candidate-contact.ts";

const contact = { applicationId: "e83e0322-f917-478e-972d-40149b06d038", full_name: "Stefan Alejandro Joyner Pérez", email: "Stefan@example.com", phone: "+503 7777 8888" };
test("booked candidate contact saves the full name, corrected email and phone", () => {
  assert.deepEqual(candidateContactSchema.parse(contact), { ...contact, email: "stefan@example.com" });
});
test("recruitment can correct booked candidates without screening", () => {
  assert.equal(canEditInterviewContact({ canEvaluate: true, isAdmin: false }, "New"), true);
});
test("approved candidates stay read-only except for Admin", () => {
  assert.equal(canEditInterviewContact({ canEvaluate: true, isAdmin: false }, "Approved for Training"), false);
  assert.equal(canEditInterviewContact({ canEvaluate: true, isAdmin: true }, "Approved for Training"), true);
});
test("reading an interview does not grant editing permission", () => {
  assert.equal(canEditInterviewContact({ canEvaluate: false, isAdmin: false }, "New"), false);
});
test("invalid email or incomplete phone cannot be saved", () => {
  assert.equal(candidateContactSchema.safeParse({ ...contact, email: "invalid" }).success, false);
  assert.equal(candidateContactSchema.safeParse({ ...contact, phone: "12" }).success, false);
});
test("a full name can be corrected when Calendly has no phone number", () => {
  assert.equal(candidateContactSchema.safeParse({ ...contact, phone: "" }).success, true);
});