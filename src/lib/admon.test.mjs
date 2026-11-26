import { test, expect } from "bun:test";
import { nextStage } from "./admon.ts";
test("screening pass goes to Operations Manager interview", () => expect(nextStage("screening", true)).toBe("operations"));
test("operations pass goes to technical interview", () => expect(nextStage("operations", true)).toBe("technical"));
test("technical pass means hired", () => expect(nextStage("technical", true)).toBe("hired"));
test("any 'no pasa' ends the process", () => { for (const s of ["screening","operations","technical"]) expect(nextStage(s, false)).toBe("rejected"); });

import { matchesResult } from "./admon.ts";
import { test as tr } from "node:test";
import assertR from "node:assert/strict";
tr("result filters: training approval requires passing the technical interview", () => {
  const c = { screening_decision: "Pasa", operations_decision: "Pasa", technical_decision: null };
  assertR.equal(matchesResult(c, "interviewed"), true);
  assertR.equal(matchesResult(c, "passed_screening"), true);
  assertR.equal(matchesResult(c, "passed_operations"), true);
  assertR.equal(matchesResult(c, "approved_training"), false);
  assertR.equal(matchesResult({ screening_decision: "No pasa", operations_decision: null, technical_decision: null }, "passed_screening"), false);
});
