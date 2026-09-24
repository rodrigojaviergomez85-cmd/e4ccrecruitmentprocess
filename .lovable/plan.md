# Fase 1: Roles, permisos por país, estados y auditoría

Solo esta fase. No se toca Make, Outlook, Calendly, la página del candidato ni el flujo de First-Time/Retake. No se borra ningún dato.

## 1. Roles definitivos
- Roles del personal: **Recruitment**, **Manager** y **Admin**.
- **Applicant**: los candidatos no tienen cuenta de personal. Entran por su enlace seguro y por el código de Retake. Cualquier cuenta que no tenga rol de personal es rechazada en el panel interno, tanto en la pantalla como en el servidor y en la base de datos.
- Las cuentas actuales con evaluator o recruiter pasan a Recruitment. Hoy solo existen 2 cuentas y ambas son Admin, así que ninguna cambia.
- Viewer queda retirado: no aparece al crear cuentas y el servidor lo rechaza. Se conserva en el historial.

## 2. Acceso por país
- Recruitment y Manager solo ven los candidatos de los países que tienen asignados (uno o varios). Admin ve todos.
- Se aplica en tres niveles: el servidor en cada listado y ficha, la base de datos con reglas por país, y la pantalla.
- La página Staff permite invitar a una persona como Recruitment o Manager, elegir sus países, editar el rol y los países después, y ver si la cuenta está activa.

## 3. Resultados de la primera entrevista
- Las opciones visibles pasan a ser **Approved**, **Retake** y **Not Approved**. Se conserva la lógica actual de correos y validaciones.
- **Approved**: el candidato queda en estado **Pending Second Filter**. Se conserva toda la entrevista y el candidato queda listo para la cola del Manager, que llega en la Fase 2.
- **Retake / Not Approved**: se guardan la etapa `recruitment_interview`, el motivo interno, los comentarios, el reclutador responsable y la fecha y hora. Not Approved nunca pasa a Pending Second Filter.
- Las entrevistas anteriores guardadas como "Approved for last step" se siguen leyendo como Approved. No se reescriben.

## 4. Registros existentes
- Las aplicaciones con estado "Approved – Final Filter Pending" pasan a "Pending Second Filter", sin tocar sus datos relacionados.
- Los registros con la razón "Approved for second filter but never showed up" se quedan tal cual, como históricos.

## 5. Auditoría ampliada
- Cada registro guarda: usuario, rol, fecha y hora, acción, entidad, ID de la aplicación, valor anterior y valor nuevo.
- Se registran los cambios de rol, de países asignados, de resultado, de estado, las reaperturas y los cambios manuales de Admin.
- Se agrega una sección de Audit Log de solo lectura para Admin en Ajustes.

## 6. Pruebas antes de reportar
Se probarán las 12 pruebas que pediste. Para ello se crearán cuentas temporales de Recruitment y Manager con países distintos y candidatos de prueba, y al final se borrarán. También se revisará que los archivos de Make, Calendly, retake y proceso no cambien.

## Detalles técnicos
- **Migración aditiva**:
  - `ALTER TYPE app_role ADD VALUE 'recruitment'`, `'manager'`, `'applicant'`.
  - Copiar evaluator/recruiter a recruitment en `user_roles` con `INSERT ... ON CONFLICT`, conservando las filas viejas con un COMMENT de deprecado.
  - Función `staff_can_see_country(uid, code)` (security definer).
  - Políticas SELECT por país en `applications` y las tablas hijas que ya leen los clientes autenticados.
  - Columnas nuevas: `interview_evaluations.decision_stage`, `decided_by`, `decided_at`, `decision_reason`; `audit_logs.actor_role`, `application_id`, `old_value`, `new_value` (jsonb).
  - Actualizar las aplicaciones con estado `Approved – Final Filter Pending` a `Pending Second Filter` (como backfill).
- **Servidor**: `staffContext` en recruiter, evaluations, scorecard, interviews y candidate-admin usa un único helper `resolveStaff()` que devuelve el nivel (recruitment, manager o admin) y los países. `STAFF_ROLES` pasa a `["admin","recruitment","manager"]`. Helper `writeAudit()` común.
- **Archivos**: `src/lib/staff.functions.ts`, `recruiter.functions.ts`, `evaluations.ts`, `evaluations.functions.ts`, `candidate-admin.functions.ts`, `scorecard.functions.ts`, `interviews.functions.ts`, `recruitment.ts`, `routes/_authenticated/staff.tsx`, `settings.tsx`, `evaluations.$applicationId.tsx` (solo las etiquetas de resultado) y `components/StaffGate.tsx`.
- **Sin cambios**: `notify.server.ts`, `calendly.server.ts`, webhooks, `retake.functions.ts`, `process.*` y `candidate-emails.ts`.
