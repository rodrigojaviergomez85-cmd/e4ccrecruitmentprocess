import { test } from "node:test";
import assert from "node:assert/strict";
import { emailRowStatus, emailStatusLabel, QUEUED_OR_SENT } from "./email-status.ts";

test("Make HTTP 200 is stored as received by Make, not as sent", () => {
  assert.equal(emailRowStatus({ ok: true, status: "accepted" }), "accepted");
  assert.equal(emailStatusLabel("accepted"), "Solicitud recibida por Make");
});
test("sent is only stored when the provider confirmed", () => {
  assert.equal(emailRowStatus({ ok: true, status: "sent" }), "sent");
  assert.equal(emailRowStatus({ ok: false, status: "failed" }), "failed");
});
test("a request already received by Make blocks a duplicate send", () => {
  assert.ok(QUEUED_OR_SENT.includes("accepted"));
  assert.ok(QUEUED_OR_SENT.includes("sent"));
});
