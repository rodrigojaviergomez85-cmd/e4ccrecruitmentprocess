import { describe, it } from "node:test";
import assert from "node:assert/strict";
const expect = (a) => ({ toBe: (e) => assert.equal(a, e) });
import {
  attended,
  interviewSource,
  isScheduled,
  pct,
  pickAppointment,
} from "./scorecard-metrics.ts";

describe("scorecard metrics", () => {
  it("counts a manual evaluation without appointment as Manual and connected", () => {
    const appt = pickAppointment([]);
    expect(interviewSource(appt)).toBe("Manual");
    expect(attended(true, appt)).toBe(true);
    expect(isScheduled(appt)).toBe(false);
  });

  it("excludes No-show from connected", () => {
    const appt = { status: "No-show", starts_at: "2026-10-10T14:00:00Z", calendly_invitee_uri: "x" };
    expect(attended(true, appt)).toBe(false);
    expect(interviewSource(appt)).toBe("Calendly");
  });

  it("does not double count reschedules", () => {
    const appt = pickAppointment([
      { status: "Rescheduled", starts_at: "2026-10-09T14:00:00Z" },
      { status: "Scheduled", starts_at: "2026-10-10T14:00:00Z" },
    ]);
    expect(appt?.status).toBe("Scheduled");
    expect(interviewSource(appt)).toBe("Manual with appointment");
  });

  it("approval rate = approved / completed", () => {
    expect(pct(3, 10)).toBe(30);
    expect(pct(1, 0)).toBe(0);
  });
});

import { connectionEligible, recruitmentDecision, isClosedRecruitment, managerDecision, isClosedManager, trainingBucket, trainingStarted, trainingExpected, lobOf, ratio, ratioLabel } from "./scorecard-metrics.ts";
describe("recruitment → training metrics", () => {
  const now = new Date("2026-10-17T16:00:00Z");
  it("future appointment does not reduce connection", () => {
    assert.equal(connectionEligible({ status: "Scheduled", starts_at: "2026-10-20T14:00:00Z" }, false, now), false);
  });
  it("canceled or rescheduled is not eligible", () => {
    assert.equal(connectionEligible({ status: "Canceled", starts_at: "2026-10-10T14:00:00Z" }, false, now), false);
    assert.equal(connectionEligible({ status: "Rescheduled", starts_at: "2026-10-10T14:00:00Z" }, false, now), false);
  });
  it("connected but unfinished interview is pending, not decided", () => {
    assert.equal(recruitmentDecision("Approved for last step", false), "Pendiente");
  });
  it("pending decision does not reduce approval rate", () => {
    const ds = ["Aprobado", "No aprobado", "Pendiente"].filter(isClosedRecruitment);
    assert.equal(ratio(ds.filter((d) => d === "Aprobado").length, ds.length).pct, 50);
  });
  it("manager approval is separate and No Show is not a closed decision", () => {
    assert.equal(managerDecision("Approved for Training", true), "Aprobado");
    assert.equal(isClosedManager(managerDecision("No Show", true)), false);
  });
  it("training no show never counts as dropout or started", () => {
    const b = trainingBucket({ status: "NO SHOW", incorporationConfirmed: true, canceledBeforeStart: false, waveStart: "2026-10-01", startedAt: null }, "2026-10-17");
    assert.equal(b, "No show");
    assert.equal(trainingStarted(b), false);
    assert.equal(trainingExpected(b), true);
  });
  it("unconfirmed incorporation is not recruited", () => {
    assert.equal(trainingBucket({ status: "RECLUTADO", incorporationConfirmed: false, canceledBeforeStart: false, waveStart: "2026-10-01", startedAt: null }, "2026-10-17"), "No reclutado");
  });
  it("Online LOB wins over country", () => {
    assert.equal(lobOf("online", "GT"), "ONLINE");
    assert.equal(lobOf("onsite", "GT"), "GUATEMALA");
  });
  it("zero denominator shows Sin base", () => {
    assert.equal(ratioLabel(ratio(0, 0)), "— / Sin base");
    assert.equal(ratioLabel(ratio(18, 100), "citas elegibles"), "18 de 100 citas elegibles = 18%");
  });
});

import { certificationRate as _cr, trainingBucket as _tb } from "./scorecard-metrics.ts";
import { test as _t, expect as _e } from "bun:test";
_t("certification is separate from attendance and counts as completed", () => {
  _e(_tb({ status: "IN TRAINING", certification: "CERTIFIED", incorporationConfirmed: true, canceledBeforeStart: false, waveStart: "2026-10-01", startedAt: null }, "2026-10-20")).toBe("Completó");
});
_t("recruiter certification rate = certified ÷ started", () => {
  const r = _cr([{ started: true, certification: "CERTIFIED" }, { started: true, certification: "NOT CERTIFIED" }, { started: false, certification: "PENDIENTE" }]);
  _e([r.num, r.den, r.pct]).toEqual([1, 2, 50]);
});
