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

## 3. Step 2 — Quick Preparation

Crear exactamente tres tarjetas compactas de igual tamaño en una cuadrícula de tres columnas:

1. **Complete Grammar Test**
   - Texto de una línea, botón **Take Test Now** al enlace de TestGorilla y **Take It Later**.
   - Permitir marcar **“I completed the Grammar Test.”** sin afirmar verificación automática.
   - Estados finales: Pending, Candidate marked as completed y Verified by recruiter.

2. **Review Grammar Tenses**
   - Texto de una línea, botón **Review Now** al documento E4CC indicado y **Review Later**.
   - Permitir marcar **“I reviewed the material.”** y guardar la fecha de finalización.

3. **Upload Your Resume**
   - Conservar el flujo privado existente: PDF/DOC/DOCX, máximo 10 MB, un solo archivo activo, reemplazo y nombre visible.
   - Mostrar estado Not uploaded, Uploaded o Replaced y check verde al completar.

- Grammar Test y Grammar Review pueden quedar pendientes con badge ámbar **Pending before interview** y no bloquean el avance ni muestran advertencias repetitivas.
- Retirar completamente Work References de esta página y del cálculo que desbloquea la agenda. Los datos existentes se conservan y permanecen visibles/editables en el perfil interno del candidato.

## 4. Step 3 — Schedule Interview

- Colocar **Schedule Your Interview** inmediatamente debajo de las tres tarjetas.
- Desbloquear Calendly únicamente cuando:
  - exista una modalidad seleccionada;
  - haya currículum;
  - para Online, la última prueba cumpla ambos mínimos o exista una anulación manual autorizada.
- Grammar Test, Grammar Review, referencias, declaración de referencias y captura de información del equipo dejan de bloquear la agenda.
- Si falta el currículum, mostrar solamente: **“Please upload your resume before scheduling your interview.”**
- Conservar el embed y fallback de Calendly existentes.
- Abrir o visualizar Calendly solo marcará que la agenda fue abierta. El estado **Interview scheduled** seguirá dependiendo de una reserva real recuperada desde Calendly, nunca del clic de apertura.
- Tras una reserva confirmada, mostrar el recordatorio de completar Grammar Test/Grammar Review si continúan pendientes e incorporarlo en las confirmaciones/recordatorios existentes que controle la aplicación.

## 5. Datos y configuración aditivos

Ampliar `recruitment_progress` sin eliminar ni renombrar columnas:

- `internet_download_mbps`, `internet_upload_mbps`, `internet_ping_ms`, `internet_tested_at`, `internet_test_passed`.
- `internet_override`, `internet_override_note`, `internet_override_by`, `internet_override_at`.
- `grammar_topics_completed_at`.
- `resume_replaced_at` para distinguir Uploaded/Replaced sin perder el archivo activo.

Añadir a la configuración existente los mínimos de descarga y subida, inicialmente 10/10 Mbps. Mantener los campos históricos (`internet_speed_mbps`, system info, referencias y declaración) para compatibilidad, pero dejar de usarlos como bloqueos de esta pantalla.

## 6. Perfil y panel del reclutador

- En la lista y ficha del candidato, añadir o conservar badges compactos para: Online/Onsite, Internet Passed/Internet Review Needed, Grammar Pending, Resume Uploaded e Interview Scheduled.
- En la ficha mostrar descarga, subida, ping, fecha de prueba, estado/nota de override, Grammar Test, Grammar Review, currículum y estado real de cita.
- Añadir una acción de override específica del requisito de Internet para Admin/Recruiter/Evaluator autorizados; Viewer permanece en solo lectura.
- Exigir nota para el override y registrar actor, fecha, candidato, resultado y nota en el audit log.
- Conservar enlaces temporales firmados para abrir currículums privados.

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
- Mantener la sincronización existente que consulta Calendly y crea/actualiza `appointments`; el evento del navegador solo solicitará esa sincronización.

## Verificación

- Probar los escenarios solicitados para Online/Onsite, retest, override, tareas pendientes, currículum único y reserva confirmada.
- Verificar que Work References ya no aparece en la página pública y sigue disponible internamente.
- Verificar permisos de candidato, staff, Viewer, alcance por país, archivos privados y auditoría.
- Comprobar visualmente escritorio y móvil con Playwright, incluyendo fila de tres tarjetas y apilado móvil.
- Ejecutar typecheck y revisar el build automático sin errores.
- Entregar capturas finales de escritorio y móvil junto con un resumen breve.
