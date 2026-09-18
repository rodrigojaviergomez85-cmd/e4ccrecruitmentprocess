# Simplificar E4CC Recruitment Process a tres pasos

Actualizar únicamente la experiencia existente de `/process/$id`, su lógica de progreso y la presentación de esos datos en el perfil interno. No se reconstruyen la solicitud, grabaciones, evaluación, acceso del equipo ni Calendly.

## 1. Flujo compacto de tres pasos

- Sustituir el checklist largo por un indicador simple: **Position → Preparation → Schedule**.
- Usar el encabezado y mensaje solicitados, textos breves y estados visibles.
- Mantener la identidad visual actual, pero ampliar el área útil para que las tres tarjetas quepan en una fila en escritorio.
- En móvil, apilar las tarjetas sin espacios excesivos.

## 2. Step 1 — Choose Position

- Mostrar primero la pregunta **“What type of position are you applying for?”** con dos opciones grandes: **Online Coach** y **Onsite Coach**.
- Guardar la selección en el campo existente `work_modality` como `online` o `onsite`, permitiendo cambiarla antes de agendar.
- Onsite pasa directamente a Preparation y no muestra requisitos técnicos.
- Online muestra un test dentro de la página con resultados reales de:
  - descarga en Mbps;
  - subida en Mbps;
  - ping/latencia en ms;
  - fecha y hora de la prueba.
- La prueba utilizará solicitudes cronometradas contra endpoints propios de medición, sin valores aleatorios ni redirecciones externas.
- El requisito inicial configurable será **10 Mbps download / 10 Mbps upload**. El resultado mostrará el mensaje verde de aprobación o el mensaje de mejora, con **Test Again** y **Change to Onsite**.
- Un resultado insuficiente no rechaza al candidato; solamente mantiene bloqueada la agenda.

## 3. Preparación previa simplificada

- Eliminar completamente de la página pública las tarjetas, botones y confirmaciones de Grammar Test y Grammar Tenses.
- No pedir al candidato que confirme esas actividades antes ni después de agendar.
- Mostrar únicamente una tarjeta compacta de **Upload Your Resume** después de elegir posición y, para Online, completar el test aprobado.
- Conservar el flujo privado existente: PDF/DOC/DOCX, máximo 10 MB, un solo archivo activo, reemplazo y nombre visible.
- Mostrar estado Not uploaded, Uploaded o Replaced y check verde al completar.
- Retirar completamente Work References de esta página y del cálculo que desbloquea la agenda. Los datos existentes se conservan y permanecen disponibles en el perfil interno del candidato.

## 4. Step 3 — Schedule Interview

- Colocar **Schedule Your Interview** inmediatamente después del currículum.
- Desbloquear Calendly únicamente cuando:
  - exista una modalidad seleccionada;
  - haya currículum;
  - para Online, la última prueba cumpla ambos mínimos o exista una anulación manual autorizada.
- Grammar Test, Grammar Review, referencias, declaración de referencias y captura de información del equipo no bloquean la agenda.
- Si falta el currículum, mostrar solamente: **“Please upload your resume before scheduling your interview.”**
- Conservar el embed y fallback de Calendly existentes; no construir otro calendario.
- Abrir Calendly no cambia el estado ni muestra éxito. La página consultará el estado real y solo mostrará éxito cuando una reserva confirmada haya creado/actualizado la cita mediante el webhook de Calendly.

### Confirmación posterior a la reserva

Después de la confirmación real, sustituir el calendario por:

- **“Your interview is scheduled!”**
- “We have sent the next steps and preparation materials to your email. Please review them before your interview.” únicamente cuando el proveedor confirme el envío.
- Fecha, hora, zona horaria, información de Zoom y correo parcialmente oculto.
- Recordatorio para revisar Inbox, Spam o Junk.
- Botón opcional **View Preparation Steps** que muestra en la misma página los pasos enviados.

Si el proveedor de correo falla:

- Mostrar **“Your interview is scheduled, but we could not send the preparation email. You can review the steps below.”**
- Mostrar **Resend Preparation Email**.
- No afirmar nunca que el correo salió si el proveedor no lo confirmó.

### Correo automático de preparación

- Enviar una sola vez por reserva confirmada, con asunto **“Your E4CC Interview Is Confirmed — Preparation Steps”**.
- Usar exactamente el cuerpo suministrado: detalles reales de fecha/hora/zona, Zoom `https://zoom.us/j/97824770369`, dispositivo, TestGorilla, documento de Grammar Tenses, video Online u Onsite según la modalidad, y recordatorio de currículum/referencias.
- Personalizar el primer nombre y las fechas usando la cita confirmada; no inventar información.
- Registrar enviado, fallido y reenviado para evitar duplicados y permitir reintento seguro.
- Mantener la verificación manual del Grammar Test dentro de la entrevista por parte del reclutador.

## 5. Datos y configuración aditivos

Ampliar `recruitment_progress` sin eliminar ni renombrar columnas:

- `internet_download_mbps`, `internet_upload_mbps`, `internet_ping_ms`, `internet_tested_at`, `internet_test_passed`.
- `internet_override`, `internet_override_note`, `internet_override_by`, `internet_override_at`.
- `resume_replaced_at` para distinguir Uploaded/Replaced sin perder el archivo activo.
- Datos de entrega del correo de preparación vinculados a la cita: estado, fecha de envío, error y contador/fecha de reenvío (reutilizando `candidate_emails` cuando corresponda).

Añadir a la configuración existente los mínimos de descarga y subida, inicialmente 10/10 Mbps. Mantener los campos históricos (`internet_speed_mbps`, system info, referencias y declaración) para compatibilidad, pero dejar de usarlos como bloqueos de esta pantalla.

## 6. Perfil y panel del reclutador

- En la lista y ficha del candidato, añadir o conservar badges compactos para: Online/Onsite, Internet Passed/Internet Review Needed, Grammar Pending, Resume Uploaded, Interview Scheduled, Preparation Email Sent/Failed/Resent.
- En la ficha mostrar descarga, subida, ping, fecha de prueba, estado/nota de override, estado manual del Grammar Test, currículum y estado real de cita.
- Añadir una acción de override específica del requisito de Internet para Admin/Recruiter/Evaluator autorizados; Viewer permanece en solo lectura.
- Exigir nota para el override y registrar actor, fecha, candidato, resultado y nota en el audit log.
- Conservar enlaces temporales firmados para abrir currículums privados.
- Mantener Work References en la ficha interna/recruiter follow-up, sin mostrarlas ni exigirlas en la página pública.

## 7. Seguridad y compatibilidad

- Mantener el acceso del candidato mediante su `applicationId` + token y validar en servidor que cada escritura pertenece a esa solicitud.
- Mantener el bucket privado y las URLs firmadas actuales.
- Validar permisos y alcance por país antes de aplicar un override.
- Preservar las políticas RLS existentes; la migración será aditiva y no borrará solicitudes, referencias, archivos, grabaciones, evaluaciones ni citas.
- No modificar el perfil de solicitud, autenticación, grabaciones, entrevista/evaluación ni la integración de Calendly.

## Detalles técnicos

- Crear endpoints limitados de medición para ping, descarga y subida. No almacenarán el payload; solo permitirán cronometrar una transferencia real.
- Evitar caché en descarga y usar un payload no comprimible de tamaño conocido; repetir muestras breves y reportar una medición estable.
- Guardar los resultados únicamente mediante la función protegida por el token del candidato, recalculando `passed` contra la configuración vigente en servidor.
- Actualizar `requirementsFor()` para que solo modalidad + currículum + requisito Online gobiernen el desbloqueo.
- La integración actual solo consulta Calendly; añadir un endpoint público de webhook que valide la firma de Calendly antes de procesar una reserva.
- Registrar la suscripción mediante la conexión existente de Calendly y enrutar sus llamadas por la conexión administrada, sin exponer credenciales al navegador.
- Hacer idempotente el procesamiento por identificador de evento/invitado para evitar citas o correos duplicados.
- El evento del navegador no marcará éxito; solo refrescará hasta encontrar la cita confirmada por webhook.
- Disparar el correo después de persistir la cita y guardar la respuesta real del proveedor antes de decidir qué mensaje mostrar.

## Verificación

- Probar Online/Onsite, retest, override, currículum único, webhook válido/inválido, idempotencia, envío exitoso/fallido y reenvío.
- Verificar que Grammar Test, Grammar Review y Work References no aparecen en la página pública y siguen disponibles internamente donde corresponda.
- Verificar permisos de candidato, staff, Viewer, alcance por país, archivos privados y auditoría.
- Comprobar visualmente escritorio y móvil con Playwright, incluyendo fila de tres tarjetas y apilado móvil.
- Ejecutar typecheck y revisar el build automático sin errores.
- Entregar capturas finales de escritorio y móvil junto con un resumen breve.
