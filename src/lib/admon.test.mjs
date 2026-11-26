import { test, expect } from "bun:test";
import { nextStage } from "./admon.ts";
test("screening pass goes to Operations Manager interview", () => expect(nextStage("screening", true)).toBe("operations"));
test("operations pass goes to technical interview", () => expect(nextStage("operations", true)).toBe("technical"));
test("technical pass means hired", () => expect(nextStage("technical", true)).toBe("hired"));
test("any 'no pasa' ends the process", () => { for (const s of ["screening","operations","technical"]) expect(nextStage(s, false)).toBe("rejected"); });
