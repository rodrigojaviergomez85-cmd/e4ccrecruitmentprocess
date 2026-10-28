import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { segmentSeconds, validHandleSeconds } from "./aht-rules.ts";

describe("AHT timer rules", () => {
  const start = "2026-10-21T16:00:00Z";
  test("a forgotten open interview adds at most 90 minutes", () => {
    assert.equal(segmentSeconds(start, null, Date.parse("2026-10-28T18:00:00Z")), 5400);
  });
  test("without heartbeat for >3 min, time stops at last heartbeat", () => {
    assert.equal(segmentSeconds(start, "2026-10-21T16:20:00Z", Date.parse("2026-10-21T17:00:00Z")), 1200);
  });
  test("durations over 3 hours are excluded from AHT", () => {
    assert.equal(validHandleSeconds(608586), false);
    assert.equal(validHandleSeconds(10800), true);
  });
});
