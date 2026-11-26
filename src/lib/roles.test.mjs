import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_LABELS, STAFF_ROLES, staffTier } from "./roles.ts";

describe("Gerente de Operaciones", () => {
  test("aparece como rol disponible en Staff Access", () => {
    assert.ok(STAFF_ROLES.includes("operations_manager"));
    assert.equal(ROLE_LABELS.operations_manager, "Gerente de Operaciones");
  });

  test("puede iniciar sesión sin obtener acceso de staff académico", () => {
    const tier = staffTier(["operations_manager"]);
    assert.equal(tier.canSignIn, true);
    assert.equal(tier.isStaff, false);
    assert.equal(tier.isOperationsManager, true);
    assert.equal(tier.primary, "operations_manager");
  });

  test("no desplaza los permisos de los roles existentes", () => {
    assert.equal(staffTier(["manager"]).isStaff, true);
    assert.equal(staffTier(["recruitment"]).isStaff, true);
    assert.equal(staffTier(["trainer"]).canSignIn, true);
  });
});
