# Correo sin expediente en Retake: mensaje claro + opción de nueva solicitud

## Qué pasa hoy

Cuando el candidato verifica su código pero el correo no tiene ninguna aplicación registrada, el sistema lanza el error genérico "We could not find a previous application for this email." como un toast rojo, sin explicar qué hacer ni ofrecer una salida.

## Qué se va a hacer

### Respuesta del backend

- `verifyRetakeAccess` (`src/lib/retake.functions.ts`): cuando el código es válido pero no existe aplicación para ese correo, el código se marca igualmente como usado (un solo uso se mantiene) y la función devuelve `{ outcome: "not_found" }` en lugar de lanzar un error.
- Los demás resultados (`retake`, `not_approved`, `open`) quedan sin cambios. El candidato nunca puede elegir ni cambiar su propio resultado.

### Pantalla de Retake (`src/routes/retake.tsx`)

- Al recibir `outcome: "not_found"`, se muestra una pantalla dedicada (no un toast):
  - Título: "We couldn't find your records"
  - Texto: "We couldn't find a previous application for this email. If this is your first time applying to E4CC, you can start a new application."
  - Botón principal "Start My Application" que lleva a `/apply` (el flujo completo de primera vez).
  - Enlace secundario "Try a different email" que reinicia el formulario para ingresar otro correo.
- El resto de la página (envío de código, verificación, estados de éxito/error de Make) queda exactamente igual; no se toca la integración de correos de Retake/Approved/Not Approved.

## Detalles técnicos

- Cambio mínimo en dos archivos: `src/lib/retake.functions.ts` (devolver `not_found`) y `src/routes/retake.tsx` (nuevo estado de pantalla con navegación a `/apply`).
- Sin cambios en base de datos, ni en Make, ni en el flujo de candidatos con expediente.

## Verificación

- Typecheck/build limpio.
- Prueba con Playwright: verificar un código válido con un correo sin expediente muestra "We couldn't find your records" y el botón "Start My Application" navega a `/apply`.
