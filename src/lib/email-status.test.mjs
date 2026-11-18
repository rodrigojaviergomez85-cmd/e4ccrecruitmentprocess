import { test } from "node:test";
import assert from "node:assert/strict";
import { emailRowStatus, emailStatusLabel, QUEUED_OR_SENT } from "./email-status.ts";

test("Make HTTP 200 is stored as received by Make, not as sent", () => {
  assert.equal(emailRowStatus({ ok: true, status: "accepted" }), "accepted");
  assert.ok(emailStatusLabel("accepted").startsWith("Solicitud recibida por Make"));
});
test("sent is only stored when the provider confirmed", () => {
  assert.equal(emailRowStatus({ ok: true, status: "sent" }), "sent");
  assert.equal(emailRowStatus({ ok: false, status: "failed" }), "failed");
});
test("a request already received by Make blocks a duplicate send", () => {
  assert.ok(QUEUED_OR_SENT.includes("accepted"));
  assert.ok(QUEUED_OR_SENT.includes("sent"));
});
import { reminderRowStatus, alreadyRequested } from "./email-status.ts";
test("reminder answered 200 Accepted by Make is stored as accepted, not sent or failed", () => {
  assert.equal(reminderRowStatus({ ok: true, status: "accepted" }), "accepted");
  assert.equal(emailStatusLabel("accepted"), "Solicitud recibida por Make; envío pendiente de confirmación");
});
test("accepted blocks automatic resend; failed and missing allow it", () => {
  assert.equal(alreadyRequested("accepted"), true);
  assert.equal(alreadyRequested("sent"), true);
  assert.equal(alreadyRequested("failed"), false);
  assert.equal(alreadyRequested(null), false);
});
