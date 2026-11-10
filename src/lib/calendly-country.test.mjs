import test from "node:test";
import assert from "node:assert/strict";
import { countryFromCalendlyAnswers } from "./calendly-country.ts";
const q = "Select Country you are applying from.";
test("maps El Salvador to SV", () => assert.deepEqual(countryFromCalendlyAnswers([{ question: q, answer: "El Salvador" }]), { code: "SV", name: "El Salvador" }));
test("multi-select takes first recognized", () => assert.equal(countryFromCalendlyAnswers([{ question: q, answer: "USA\nColombia" }])?.code, "CO"));
test("unknown country stays empty", () => assert.equal(countryFromCalendlyAnswers([{ question: q, answer: "USA" }]), null));
