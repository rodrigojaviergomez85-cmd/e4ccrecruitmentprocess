import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attentionPoints, connectionEligible, conversionToTraining, finalTier, isClosedManager,
  pickAppointment, sumRatio, tierDistribution, trainingBucket, ratio,
} from "./scorecard-metrics.ts";

const now = new Date("2026-10-17T12:00:00Z");
describe("executive scorecard", () => {
  it("conversion uses the final-approved population only", () => {
    const r = conversionToTraining([
      { finalApproved: true, started: true }, { finalApproved: true, started: false },
      { finalApproved: false, started: true },
    ]);
    assert.deepEqual([r.num, r.den, r.pct], [1, 2, 50]);
  });
  it("TOTAL sums numerators and denominators, not percentages", () => {
    const t = sumRatio([ratio(1, 1), ratio(1, 9)]);
    assert.equal(t.pct, 20);
  });
  it("connection excludes future and canceled appointments", () => {
    assert.equal(connectionEligible({ status: "Scheduled", starts_at: "2026-10-20T12:00:00Z" }, false, now), false);
    assert.equal(connectionEligible({ status: "Canceled", starts_at: "2026-10-01T12:00:00Z" }, false, now), false);
    assert.equal(connectionEligible({ status: "Scheduled", starts_at: "2026-10-01T12:00:00Z" }, false, now), true);
  });
  it("manager approval rate ignores pending", () => {
    assert.equal(isClosedManager("Pendiente"), false);
  });
  it("manager tier wins and tiers count once", () => {
    assert.equal(finalTier("C", "A"), "A");
    assert.equal(finalTier("B", null), "B");
    const d = tierDistribution(["A", "B", null, "A"]);
    assert.deepEqual([d.A.num, d.A.den, d.unclassified], [2, 3, 1]);
  });
  it("future start date is not a no-show", () => {
    const b = trainingBucket({ status: "RECLUTADO", incorporationConfirmed: true, canceledBeforeStart: false, waveStart: "2026-11-01", startedAt: null }, "2026-10-17");
    assert.equal(b, "Pendiente de iniciar");
  });
  it("a rescheduled booking counts once", () => {
    const a = pickAppointment([
      { status: "Rescheduled", starts_at: "2026-10-01T10:00:00Z" },
      { status: "Scheduled", starts_at: "2026-10-02T10:00:00Z" },
    ]);
    assert.equal(a.starts_at, "2026-10-02T10:00:00Z");
  });
  it("attention gap excludes people with an upcoming start", () => {
    const p = attentionPoints({ pendingDays: [], finalApproved: 5, started: 2, upcomingStart: 3, lossReasons: [] });
    assert.equal(p.length, 0);
  });
});
