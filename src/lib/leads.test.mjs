import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isCallMade, isCallConnected, isCalendlyScheduled, valueGroup, weeklyMetrics, parseSheetDateTime, canonicalRecruiter } from "./leads.ts";

const base = { lead_created_at: null, msg_at: null, call_at: null, filtro_lead: "", mensaje: "", llamada: "", msg_recruiter: "", call_recruiter: "", interview_result: "", lovable: null };
const W0 = Date.parse("2026-10-19T06:00:00Z"), W1 = W0 + 7 * 86400_000;
const inWeek = "2026-10-20T15:00:00.000Z";

describe("Leads rules", () => {
  test("OPEN HOUSE INVITE is not a call made nor connected", () => {
    assert.equal(isCallMade("OPEN HOUSE INVITE"), false);
    assert.equal(isCallConnected("OPEN HOUSE INVITE"), false);
  });
  test("CALENDLY is scheduling, not a call or attendance", () => {
    assert.equal(isCalendlyScheduled("AGENDA POR MEDIO DE CALENDLY"), true);
    assert.equal(isCallMade("CALENDLY"), false);
  });
  test("NO ANSWER is a call made but not connected", () => {
    assert.equal(isCallMade("NO ANSWER"), true);
    assert.equal(isCallConnected("NO ANSWER"), false);
  });
  test("equivalent spellings share one group", () => {
    assert.equal(valueGroup("BLACK LISTED"), valueGroup("BLACKLISTED"));
    assert.equal(valueGroup("NO INTERESADO / HUNG UP"), "No interesado");
  });
  test("filter, call and interview approvals are counted separately", () => {
    const m = weeklyMetrics([{ ...base, lead_created_at: inWeek, filtro_lead: "APPROVED", call_at: inWeek, llamada: "NOT APPROVED" }], W0, W1);
    assert.equal(m.filterApproved, 1);
    assert.equal(m.callApproved, 0);
    assert.equal(m.interviewApproved, 0);
  });
  test("Approved for last step counts as advance, not interview approval", () => {
    const m = weeklyMetrics([{ ...base, lovable: { interviewed_at: inWeek, result: "Approved for last step", appointment_at: null } }], W0, W1);
    assert.equal(m.lastStep, 1);
    assert.equal(m.interviewApproved, 0);
  });
  test("sheet date D/M/YYYY parses as El Salvador time", () => {
    assert.equal(parseSheetDateTime("26/6/2026", "11:00:00 a.m."), "2026-06-26T17:00:00.000Z");
  });
  test("recruiter spellings merge", () => {
    assert.equal(canonicalRecruiter("KENIA"), "KENNIA VASQUEZ");
    assert.equal(canonicalRecruiter("MORENA"), "MORENA LEMUS");
  });
});
