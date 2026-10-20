import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { quotaFor, recruiterBoard, shareOf } from "./recruiter-quota.ts";

describe("Recruiter quota split", () => {
  test("Morena carries 65% and Kennia 35% of the hiring goal", () => {
    assert.equal(shareOf("MORENA LEMUS").share, 0.65);
    assert.equal(shareOf("Kennia Vasquez").share, 0.35);
    assert.equal(quotaFor(14, 0.65), 10);
    assert.equal(quotaFor(14, 0.35), 5);
  });
  test("Roberto Sánchez has no hiring quota", () => {
    assert.equal(shareOf("ROBERTO SANCHEZ"), null);
  });
  test("Approved to Training counts manager approvals in period per recruiter", () => {
    const row = (recruiter, mgr, at) => ({ recruiter, sentToSecondFilter: true, recruitmentDecidedAt: at, managerDecision: mgr, managerDecidedAt: at, training: null });
    const b = recruiterBoard([row("MORENA LEMUS", "Aprobado", "2026-10-05"), row("MORENA LEMUS", "No aprobado", "2026-10-06"), row("MORENA LEMUS", "Aprobado", "2026-09-01")], "2026-10-01");
    assert.equal(b[0].approved, 1);
    assert.equal(b[0].sent, 2);
    assert.equal(b[0].quality, 50);
  });
});
