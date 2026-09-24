# Arreglar: el Manager entra y no ve ningún candidato

## Causa confirmada
La cuenta roberto.sanchez@e4ccglobal.com tiene el rol Manager, pero **no tiene ningún país asignado**. Con las reglas de la Fase 1, un Manager solo ve candidatos de sus países; sin países, no ve nada. No es una falla de datos: hay 1 candidato en Pending Second Filter y 49 activos en total.

## Cambios
1. **Asignar países a Roberto** (los que tú elijas) para que vea su cola de inmediato. Queda registrado en el Audit Log.
2. **Aviso claro para el personal sin países**: en lugar de una pantalla vacía, Recruitment o Manager verán "Your account has no countries assigned. Ask an Admin to assign them in Staff."
3. **Evitar que se repita**: en Staff, al invitar o editar a un Recruitment o Manager, será obligatorio elegir al menos un país. Las cuentas que ya existen sin países se marcan con "No countries".
4. **Probar** con la cuenta de Roberto (solo lectura) que ve el Dashboard y la cola Pending Second Filter de sus países.

No se cambia Make, Calendly, correos ni datos de candidatos.

## Detalles técnicos
- Insertar en `staff_countries` para el user_id de Roberto + `writeAudit` (staff.countries_changed).
- `getStaffContext` devuelve `countries`; dashboard y `second-filter.index` muestran el aviso si no es admin y `countries.length === 0`.
- Validación en `staff.functions.ts` (zod `min(1)` si el rol no es admin) y en el formulario de `staff.tsx`.
