import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessCandidate } from "./candidate-access.ts";

const robertoCountries = ["CO", "GT", "HN", "MX", "NI", "OTHER", "SV"];
test("Roberto can open Sifredo's countryless Calendly booking", () => {
  assert.equal(canAccessCandidate(robertoCountries, ["manager"], { country_code: null, source: "calendly" }), true);
});
test("managers cannot open candidates from an unassigned country", () => {
  assert.equal(canAccessCandidate(["SV"], ["manager"], { country_code: "GT", source: "calendly" }), false);
});
test("countryless non-Calendly candidates are not exposed", () => {
  assert.equal(canAccessCandidate(robertoCountries, ["manager"], { country_code: null, source: "manual" }), false);
});
test("viewers cannot claim the interview-staff exception", () => {
  assert.equal(canAccessCandidate(robertoCountries, ["viewer"], { country_code: null, source: "calendly" }), false);
});
test("assigned countries and admin access are preserved", () => {
  assert.equal(canAccessCandidate(["SV"], ["manager"], { country_code: "SV" }), true);
  assert.equal(canAccessCandidate(null, ["admin"], { country_code: null, source: "manual" }), true);
});