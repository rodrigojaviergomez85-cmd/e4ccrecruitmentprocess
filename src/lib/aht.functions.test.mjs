import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { segmentSeconds, validHandleSeconds } from "./aht-rules.ts";
import { stopInterviewTimer } from "./aht.server.ts";

// Execute the real handlers with an in-memory query adapter: no live interviews are modified.
const source = readFileSync(process.env.AHT_SOURCE ?? new URL("./aht.functions.ts", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace(/async function roles\(userId: string\) \{[\s\S]*?\n\}/, "")
  .replace(/export const /g, "const ");
const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
const build = new Function("createServerFn", "requireSupabaseAuth", "z", "roles", "segmentSeconds", "validHandleSeconds", `${js}\nreturn {startInterviewTimer, pauseInterviewTimer, heartbeatInterviewTimer};`);

function setup(kind) {
  const row = { id: "interview", timer_owner_id: null, timer_active_user_id: null, timer_started_at: null, timer_ended_at: null, timer_last_seen_at: null, handle_seconds: 0 };
  const db = {
    from(table) {
      assert.equal(table, kind === "manager" ? "manager_evaluations" : "interview_evaluations");
      const filters = [];
      let values;
      const query = {
        select() { return this; },
        update(value) { values = value; return this; },
        eq(key, value) { filters.push(() => row[key] === value); return this; },
        is(key, value) { filters.push(() => row[key] === value); return this; },
        not(key, op, value) { filters.push(() => row[key] !== value); return this; },
        async maybeSingle() { return { data: filters.every((f) => f()) ? { ...row } : null }; },
        then(resolve, reject) {
          if (filters.every((f) => f()) && values) Object.assign(row, values);
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const createServerFn = () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn) { return fn; } });
  const handlers = build(createServerFn, {}, z, async () => ({ db, tier: { isRecruitment: true, isManager: true } }), segmentSeconds, validHandleSeconds);
  const call = (fn, userId) => handlers[fn]({ context: { userId }, data: { kind, evaluationId: row.id } });
  const ageSegment = (seconds) => {
    const timestamp = new Date(Date.now() - seconds * 1000).toISOString();
    row.timer_started_at = timestamp;
    row.timer_last_seen_at = timestamp;
  };
  return { row, db, call, ageSegment };
}

for (const kind of ["recruitment", "manager"]) {
  for (const finish of [false, true]) {
    test(`${kind}: colleague's four-minute resumed session counts on ${finish ? "finish" : "pause"} without transferring attribution`, async () => {
      const { row, db, call, ageSegment } = setup(kind);
      await call("startInterviewTimer", "A");
      ageSegment(120);
      await call("pauseInterviewTimer", "A");
      assert.equal(row.handle_seconds, 120);
      await call("startInterviewTimer", "B");
      ageSegment(240);
      await call("heartbeatInterviewTimer", "B");
      if (finish) await stopInterviewTimer(db, kind === "manager" ? "manager_evaluations" : "interview_evaluations", row.id);
      else await call("pauseInterviewTimer", "B");
      assert.equal(row.handle_seconds, 360);
      assert.equal(row.timer_owner_id, "A");
      assert.equal(row.timer_active_user_id, null);
    });
  }
  test(`${kind}: visiting a running interview cannot steal control, heartbeat or pause it`, async () => {
    const { row, call, ageSegment } = setup(kind);
    await call("startInterviewTimer", "A");
    ageSegment(240);
    const before = { ...row };
    await call("startInterviewTimer", "B");
    await call("heartbeatInterviewTimer", "B");
    await call("pauseInterviewTimer", "B");
    assert.deepEqual(row, before);
  });
  test(`${kind}: prior interviewer cannot heartbeat or pause the colleague's resumed segment`, async () => {
    const { row, call, ageSegment } = setup(kind);
    await call("startInterviewTimer", "A");
    await call("pauseInterviewTimer", "A");
    await call("startInterviewTimer", "B");
    ageSegment(240);
    const before = { ...row };
    await call("heartbeatInterviewTimer", "A");
    await call("pauseInterviewTimer", "A");
    assert.deepEqual(row, before);
  });
  test(`${kind}: finished paused interviews cannot resume`, async () => {
    const { row, call } = setup(kind);
    row.timer_ended_at = new Date().toISOString();
    const result = await call("startInterviewTimer", "A");
    assert.equal(result.startedAt, null);
    assert.equal(row.timer_started_at, null);
  });
}