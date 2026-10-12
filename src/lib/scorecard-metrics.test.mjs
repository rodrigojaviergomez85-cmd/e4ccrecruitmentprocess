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
