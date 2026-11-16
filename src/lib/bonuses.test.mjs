import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, referralBonusAmount, hiringBonusAmount, nextCutoff } from "./bonuses.ts";

test("certified on the 10th pays on the 14th: $200 = 50 m1, 50 m3, 100 m6", () => {
  assert.deepEqual(schedule("2026-10-10", 200).map((i) => [i.amount, i.payOn]), [[50, "2026-11-14"], [50, "2027-01-14"], [100, "2027-04-14"]]);
});
test("certified on the 22nd pays on the 28th: $100 = 50 m1, 50 m3", () => {
  assert.deepEqual(schedule("2026-10-22", 100).map((i) => [i.amount, i.payOn]), [[50, "2026-11-28"], [50, "2027-01-28"]]);
});
test("certified on the 15th still pays on the 14th; 16th on the 28th", () => {
  assert.equal(schedule("2026-10-15", 100)[0].payOn, "2026-11-14");
  assert.equal(schedule("2026-10-16", 100)[0].payOn, "2026-11-28");
});
test("referral: online $100, onsite 6+ hours $200, onsite under 6 hours $100", () => {
  assert.equal(referralBonusAmount(true, "Lunes a viernes: 9:00 AM–6:00 PM"), 100);
  assert.equal(referralBonusAmount(false, "Lunes a viernes: 9:00 AM–6:00 PM"), 200);
  assert.equal(referralBonusAmount(false, "Lunes a viernes: 5:00 PM–9:00 PM"), 100);
});
test("hiring bonus amount parsed; none = 0", () => {
  assert.equal(hiringBonusAmount("$500 — Superstar"), 500);
  assert.equal(hiringBonusAmount("No hiring bonus — PB/PB+ profile"), 0);
});
test("next cut-off", () => {
  assert.equal(nextCutoff("2026-11-16"), "2026-11-28");
  assert.equal(nextCutoff("2026-12-30"), "2027-01-14");
});
