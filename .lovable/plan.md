# Diagnóstico E4CC vs. Documento Maestro (sin cambios todavía)

Todo se construye dentro de este mismo proyecto. Solo se agregan cosas a la base de datos, sin borrar nada. Se conservan los candidatos, entrevistas, correos, citas y ajustes actuales.

## 1. Qué ya existe y funciona (se reutiliza)
- **Home con First-Time / Retake**: dos tarjetas y el flujo de primera aplicación (/apply con grabaciones y evaluación de inglés).
- **Retake seguro**: código de 6 dígitos guardado cifrado, vence en 10 min, un solo uso, intentos limitados. Solo confirma el envío si Make responde bien. Tiene las pantallas "We don't have your records" y "Eligible again".
- **Página del proceso**: Online/Onsite, prueba de internet real (bajada, subida, ping, fecha, mínimo 10 Mbps, repetir la prueba, excepción autorizada por Admin), CV privado obligatorio y referencias de 1 a 5 (la 1 obligatoria, en tarjetas compactas).
- **Calendly**: calendario dentro de la página, webhook firmado, sincronización, sin citas duplicadas y la página /interview-confirmed.
- **Correos por Make → Outlook**: código de verificación, preparación, Retake, Not Approved (con la regla de privacidad) y Approved. Hay historial Sent/Failed y botones Retry/Resend.
- **Primera entrevista (Recruitment)**: formulario por secciones con autoguardado, Grammar Test, verbos, internet autollenado, cierre anticipado, bloqueo al enviar, reapertura solo por Admin con auditoría e intentos numerados para retakes.
- **Dashboard y ficha del candidato**: badges (RETAKE, modalidad, internet, CV, correo), archivar/restaurar, alta manual y detección de duplicados.
- **Scorecard / reportes**: página con filtros y exportación CSV. **Staff**: cuentas por invitación con países permitidos. **Audit log** general.

## 2. Qué existe, pero necesita cambios
- **Roles**: hoy son admin / evaluator / recruiter / viewer. El documento pide Recruitment / Manager / Admin, con Applicant fuera del staff. Hoy solo hay 2 cuentas, ambas Admin, así que migrar no pone en riesgo a nadie. Propuesta: agregar `manager`, tratar evaluator y recruiter como "Recruitment" y retirar viewer sin borrarlo.
- **Resultado Approved de la primera entrevista**: hoy deja el estado "Approved – Final Filter Pending". Debe pasar a **Pending Second Filter** y entrar a la cola del Manager.
- **Guardar la etapa de la decisión**: Not Approved y Retake deben registrar `decision_stage` (recruitment_interview o manager_final_filter), el motivo y el responsable.
- **"Approved for second filter but never showed up"**: hoy es una razón de Not Approved de Recruitment. Pasa a ser el resultado **No Show** del Manager, conservando los registros actuales.
- **Referencias**: hoy piden supervisor_position y email opcional. El documento pide Notes y fechas, y permitir eliminar referencias adicionales. Es un ajuste menor.
- **Prueba de internet**: falta guardar el navegador o dispositivo.
- **Correos**: el envío a Make debe aceptar campos opcionales (attachment_url, survey_url, candidate_id, application_id) y guardar el HTTP status.
- **Auditoría**: debe guardar el rol, el valor anterior y el valor nuevo.
- **Reportes**: faltan las etapas de Manager y Training, y reportes semanales y mensuales.

## 3. Qué falta construir
1. Cola **Pending Second Filter** y vista del Manager con toda la evaluación anterior.
2. **Scorecard del Manager** (10/30/25/25/10, con mínimos por área y una recomendación que no decide sola) y sus resultados: Approved for Training, Retake, Not Approved y No Show, cada uno con su correo.
3. Correo de **No Show** con los botones Reschedule y Withdraw (Withdraw guarda que el candidato se retira).
4. **Cohorts de Training**: crear, editar y cambiar estado.
5. **Correo de bienvenida a Training**: versión Online u Onsite, materiales y la **lista de documentos según el país**, guardando qué documentos se pidieron.
6. **Convenios** Online y Onsite: se llenan solos, se genera el PDF y se sigue su estado (Generated → Signed).
7. **Portal de Training**: 7 estados, historial, diploma en PDF, correo de Not Certified y encuesta de salida.
8. **Análisis interno del CV con IA**: se hace una vez por cada versión del CV y solo lo ve el personal.
9. **Importador histórico** CSV/XLSX con vista previa y sin duplicar candidatos.

## 4. Riesgos de duplicación a evitar
- Crear otro perfil o tabla de candidatos para Manager o Training. Se usa siempre el mismo `application_id`.
- Crear otro formulario de entrevista. El del Manager es una evaluación nueva ligada a la misma aplicación, no una copia.
- Otro webhook, otro proveedor de correo, otra cuenta de Calendly, otro login u otro dashboard. Manager y Training son páginas nuevas dentro del mismo panel.
- Nuevas plantillas de Retake o Not Approved. Se reutilizan las actuales y solo se amplían.
- Roles paralelos, como un rol "Trainer" aparte.

## 5. Orden recomendado por fases
- **Fase 1: Roles y estados.** Agregar el rol Manager y los permisos Recruitment/Manager/Admin en servidor y base de datos. Approved pasa a Pending Second Filter. Guardar `decision_stage`. Ampliar la auditoría.
- **Fase 2: Segundo filtro.** Cola y vista del Manager, scorecard, 4 resultados, correos por Make y No Show con Reschedule/Withdraw.
- **Fase 3: Cohorts y aprobación para Training.** Correo de bienvenida y documentos según el país.
- **Fase 4: Convenios.** Necesito los dos archivos .docx.
- **Fase 5: Portal de Training.** Diplomas, correo de Not Certified y encuestas de salida.
- **Fase 6: Análisis del CV con IA.**
- **Fase 7: Importador histórico.** Necesito un archivo de ejemplo.
- **Fase 8: Reportes.** Reportes semanales y mensuales, más las pruebas completas de aceptación.

## Qué necesito de ti (más adelante)
- Los archivos `CONVENIO_ARREGLADO(2).docx` y `CONVENIO ONLINE ... .docx` (Fase 4).
- El diseño o texto del diploma y el enlace o formato de la encuesta de salida (Fase 5).
- Archivos de ejemplo para importar (Fase 7).
- Confirmar si el Manager ve todos los países o solo los que tiene asignados, como hoy los reclutadores.

## Detalles técnicos
- Enum `app_role`: `ADD VALUE 'manager'`. Una función `staff_tier()` traduce evaluator y recruiter a Recruitment, y viewer queda retirado con un COMMENT.
- Tablas nuevas previstas: `manager_evaluations`, `training_cohorts`, `training_enrollments`, `training_status_history`, `candidate_agreements`, `cv_analyses`, `import_batches` y `import_rows`. Todas con GRANTs y RLS limitada al personal, sin acceso anónimo.
- Columnas nuevas previstas: `interview_evaluations.decision_stage`, `recruitment_progress.internet_user_agent`, `work_references.notes`, `candidate_emails.http_status`, y `audit_logs.actor_role / old_value / new_value`.
- Para los PDF (convenios y diplomas) se usará una librería de PDF en JavaScript compatible con el servidor. Se guardan en el almacenamiento privado `candidate-media`.
