# Arreglar el botón "Send Secure Code"

## Qué pasa hoy

El botón sí llama al backend, pero el resultado del envío se ignora: la pantalla pasa siempre a "escribe tu código" aunque nunca haya salido nada.

Tres causas confirmadas en el código:

1. Si el correo no coincide con ninguna aplicación registrada, la función termina de inmediato devolviendo "ok" sin generar código ni llamar a Make.
2. Lo mismo ocurre con el límite antifraude (más de 100 códigos en 15 minutos): devuelve "ok" en silencio.
3. Cuando sí se envía, no se revisa la respuesta de Make; el resultado de envío se descarta y la pantalla muestra éxito igual.

Además el envío viaja con la etiqueta `access_code`, no `verification_code`, y el asunto no es el pedido.

## Qué se va a hacer

### Botón y pantalla

- El botón ejecuta la función del backend y espera su respuesta real. Sin temporizadores, códigos fijos ni mensajes simulados.
- Solo si Make responde correctamente se muestra: "We sent a 6-digit verification code to your email".
- Si Make falla o no está configurado: "We could not send your code. Please try again." y el candidato puede reintentar. No se avanza al paso del código.

### Correo escrito en Home

- Se limpia de espacios y se pasa a minúsculas antes de usarlo.
- Se valida que sea un correo bien formado; si no, aviso inmediato sin llamar al backend.
- Ese mismo correo normalizado es el que viaja en el campo `to`.

### Código de verificación

- Seis dígitos aleatorios generados en el backend.
- Se guarda cifrado (hash), vinculado al correo, con vencimiento de 10 minutos y un solo uso; los intentos siguen limitados.
- Si el correo no tiene aplicación previa, igual se genera y envía el código para no revelar quién existe; la verificación posterior sigue exigiendo un expediente válido.

### Envío por Make

- El envío usa el webhook guardado en el backend (`MAKE_RECRUITMENT_WEBHOOK_URL`), que nunca aparece en el navegador ni en los registros.
- POST con `Content-Type: application/json` y los campos: `to`, `candidate_name` (nombre encontrado o "Candidate"), `result: verification_code`, `subject: Your E4CC Verification Code`, `html_body` con el código de seis dígitos y el aviso de que vence en 10 minutos.
- Se espera la respuesta HTTP y de ella depende el mensaje en pantalla.

### Registros

Se registran en el backend: `verification_code_request_started`, el correo normalizado, el código de estado de la respuesta de Make y el error si lo hubo. Nunca el código ni la dirección del webhook.

## Detalles técnicos

- `src/lib/retake.functions.ts` → `requestRetakeAccess`: normaliza/valida el correo, genera y guarda el código aunque no exista aplicación (token desligado cuando no hay expediente), llama a `sendEmail` con `result: "verification_code"` y asunto fijo, y devuelve `{ ok }` según `SendResult.ok`.
- La tabla `retake_access_tokens` exige `application_id`; se añade una migración aditiva que permite guardar el correo normalizado y dejar `application_id` nulo para códigos sin expediente, manteniendo hash, vencimiento, intentos y un solo uso.
- `verifyRetakeAccess` acepta el código guardado por correo y sigue exigiendo una aplicación existente para continuar.
- `src/routes/retake.tsx`: `onSuccess` solo avanza cuando `ok` es verdadero; si no, muestra el mensaje de error.
- `notify.server.ts` y las plantillas de Retake, Approved y Not Approved quedan intactas; no se usa Resend, Lovable Emails, Gmail ni el correo de autenticación.

## Prueba antes de darlo por resuelto

Se ejecuta el flujo real contra Make y solo se reporta listo cuando aparece la ejecución con `result: verification_code`, el campo `to` es exactamente el correo escrito, y el correo con el código llega a ese destinatario.

Para esa prueba necesito el correo al que debo enviar el código de verificación.
