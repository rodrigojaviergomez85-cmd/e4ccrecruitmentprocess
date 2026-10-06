import { describe, test } from "node:test";
import assert from "node:assert/strict";
const expect = (actual) => ({ toBe: (expected) => assert.equal(actual, expected), toEqual: (expected) => assert.deepEqual(actual, expected) });
import { trainingGroup, trainingPermissions, approvalBlocked, documentsPercent, requisitionSummary } from "./training.ts";
import { staffTier } from "./roles.ts";

describe("Training Tracker rules", () => {
  test("Generalistas verify documents without recruitment or training edits", () => {
    expect(trainingPermissions(["generalista"])).toEqual({ canEditDocuments: true, canEditReferences: false, canEditTraining: false, canManageRequisitions: false, trainingOnly: true });
    expect(staffTier(["generalista"]).isStaff).toBe(false);
  });
  test("Recruitment owns reference calls, not document verification", () => {
    expect(trainingPermissions(["recruitment"]).canEditReferences).toBe(true);
    expect(trainingPermissions(["recruitment"]).canEditDocuments).toBe(false);
  });
  test("Trainers cannot verify references or documents", () => {
    expect(trainingPermissions(["trainer"])).toEqual({ canEditDocuments: false, canEditReferences: false, canEditTraining: true, canManageRequisitions: false, trainingOnly: true });
  });
  test("Online has priority over country; onsite groups use countries", () => {
    expect(trainingGroup("online", "GT")).toBe("ONLINE");
    expect(trainingGroup("onsite", "SV")).toBe("EL SALVADOR");
    expect(trainingGroup("onsite", "NI")).toBe("NICARAGUA");
    expect(trainingGroup("onsite", "GT")).toBe("GUATEMALA");
  });
  test("Approval remains blocked until references are done and recommended", () => {
    expect(approvalBlocked("pending")).toBe(true);
    expect(approvalBlocked("not_recommended")).toBe(true);
    expect(approvalBlocked("done")).toBe(false);
  });
  test("Only required received documents count toward completeness", () => {
    expect(documentsPercent(["DUI", "Diploma"], { DUI: true, Diploma: false, Other: true })).toBe(50);
    expect(documentsPercent(["DUI", "Diploma"], { DUI: true, Diploma: true })).toBe(100);
  });
});
describe("requisitions", () => {
  test("only full staff manage requisitions", () => {
    expect(trainingPermissions(["recruitment"]).canManageRequisitions).toBe(true);
    expect(trainingPermissions(["generalista"]).canManageRequisitions).toBe(false);
  });
  test("spots stay open until filled", () => {
    expect(requisitionSummary([{ filledApplicationId: "a" }, { filledApplicationId: null }, { filledApplicationId: null }])).toEqual({ total: 3, filled: 1, open: 2 });
  });
});
