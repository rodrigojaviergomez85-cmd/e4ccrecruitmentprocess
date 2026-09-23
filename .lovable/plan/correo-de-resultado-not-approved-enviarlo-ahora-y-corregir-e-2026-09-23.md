# Correo de resultado "Not approved": enviarlo ahora y corregir el flujo

## Qué encontré (verificado)

- La entrevista más reciente con resultado **Not approved** es la de **KENNIA ELIZABETH VASQUEZ CASTILLO** (correo del expediente: `keniacastillo9@gmail.com`), actualizada hoy 19:34. Quedó guardada como **"In progress"**, es decir, el cierre de la entrevista no llegó a completarse (faltaban campos obligatorios).
- Hay otra entrevista Not approved del mismo expediente cerrada a las 17:09 con la razón "No English level", y **tampoco tiene ningún correo registrado**.
- Causa raíz: al finalizar una entrevista el sistema **no envía nada**. El envío solo ocurre si el evaluador baja hasta la tarjeta "Candidate result email" y presiona "Send Result". Por eso no hubo ejecución en Make.
- El correo actual de Not approved usa el asunto "E4CC — Update on your application" e incluye siempre "Area of opportunity" y un plan de acción, lo que puede revelar el motivo interno.

## Acción inmediata

Enviar el correo pendiente de esa entrevista Not approved al correo real del expediente, mediante el webhook de Make (`result: "not_approved"`, asunto `Thank you for interviewing with E4CC`), registrarlo en el historial del candidato y confirmar solo después de ver la respuesta exitosa de Make y el registro con estado **Sent**. No se crea ni se duplica ninguna entrevista.

## Nuevo contenido del correo

- Asunto: `Thank you for interviewing with E4CC`
- Cuerpo general (sin mencionar el motivo), exactamente con el texto aprobado: agradecimiento, "we have decided not to move forward with your application at this time", cierre y firma "E4CC Recruitment Team".
- **Regla de privacidad:** solo se agrega una sección de "area of improvement" cuando la razón seleccionada es una de estas tres:
  - No English level
  - No grammar knowledge
  - No equipment or technical requirements
- Con cualquier otra razón (Overage, Other, red flags, motivos críticos, etc.) se envía el correo general sin insinuar el motivo.
- Nunca se incluyen comentarios internos, edad, fecha de nacimiento, red flags ni notas del evaluador.

## Corrección permanente del flujo

Cuando el evaluador finalice una entrevista (incluido el cierre anticipado) con resultado **Not approved**:

1. Se guarda la entrevista.
2. El resultado se convierte a `not_approved`.
3. Se genera el correo con la regla de privacidad anterior.
4. Se llama de verdad al webhook de Make y se espera su respuesta.
5. Se marca **Sent** solo si Make responde correctamente; si falla se guarda **Failed** y aparece **Retry email**.
6. Nunca se muestra un mensaje de éxito simulado.

Además:

- En el expediente del candidato se agrega **Send / Resend email**, con el estado del último envío (Sent / Failed / fecha / destinatario).
- Se mantiene la protección contra duplicados: un solo correo por entrevista, salvo que el evaluador use Retry o Resend.
- Los correos de Retake y Approved siguen igual (se enviarán también al finalizar, con la misma verificación de respuesta de Make, sin cambiar su contenido).

## Detalles técnicos

- `src/lib/candidate-emails.ts`: reescribir la rama `not_approved` de `buildFollowUpEmail` con el nuevo asunto y cuerpo; añadir un parámetro de razones y una lista blanca (`No English level`, `No grammar knowledge`, `No equipment or technical requirements`) que decide si se incluye el bloque de mejora; eliminar el plan de acción y el volcado de comentarios del evaluador.
- `src/lib/evaluations.functions.ts`:
  - `saveEvaluation` (rama `data.submit`): tras guardar, llamar a `sendFollowUp` con el `kind` derivado del `final_result` y devolver el resultado del envío en `email`.
  - `sendResultEmail`: dejar de pasar `evaluation.comments` como `areas` para `not_approved`; pasar solo las razones y dejar que la plantilla filtre.
- `src/routes/_authenticated/evaluations.$applicationId.tsx`: al finalizar, reflejar `res.email` en el estado (`sent` / `failed`) con el toast correspondiente y mostrar **Retry email** si falló.
- `src/routes/_authenticated/candidates.$id.tsx`: botón **Send / Resend email** usando `sendFollowUpEmail` (con `force` para reenviar) y estado del último correo desde `candidate_emails`.
- Envío inmediato del correo pendiente: ejecutar `sendFollowUp` para la entrevista Not approved más reciente (aplicación `61690318…`) con la plantilla nueva, verificando la respuesta HTTP de Make y el registro en `candidate_emails`.
