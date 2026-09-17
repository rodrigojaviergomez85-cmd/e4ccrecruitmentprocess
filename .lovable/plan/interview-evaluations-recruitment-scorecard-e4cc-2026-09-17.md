# Interview Evaluations + Recruitment Scorecard (E4CC)

Nuevo módulo interno para el equipo, encima de lo que ya existe. No se toca el portal del aplicante, las grabaciones, el resultado de inglés automático, la agenda ni el panel actual.

## Cómo se entrega (3 fases)

**Fase 1 — Acceso y formulario de evaluación**
- Nuevo rol **Evaluator** (junto a Admin / Recruiter / Viewer), asignable desde la página Staff, con los mismos países permitidos que ya se usan hoy.
- Nueva página **Interview Evaluations** en el menú lateral, visible solo para quien tiene permiso. Protegida también en el servidor y en la base de datos, no solo ocultando el enlace.
- Panel del evaluador: entrevistas de hoy, próximas, evaluaciones en curso, enviadas, retakes pendientes y aprobados; búsqueda por nombre, correo o teléfono y filtros por fecha, país, ciudad, modalidad, evaluador y estado.
- Al abrir un candidato se cargan solos sus datos ya existentes (nombre, teléfono, correo, país, ciudad, referencia, nivel de inglés previo, modalidad, cita, currículum, referencias laborales y estado del Grammar Test). No se crea un segundo registro de candidato.
- Formulario por secciones con barra de progreso, autoguardado, botones Anterior/Siguiente, aviso de campos faltantes y estados Sin iniciar / En progreso / Enviada / Reabierta.
  Secciones: Candidato y puesto · Equipo e internet (solo Online) · Grammar Test · Perfil, disponibilidad y expectativas · Inglés y gramática · Estudios · Experiencia laboral (1 a 5 puestos, se agregan solo cuando hacen falta) · Metas, motivación y valores E4CC · Resultado final.
- Verbos irregulares: el evaluador escribe los 5 a 10 verbos que usó y marca correcto/incorrecto; el sistema calcula evaluados, correctos, incorrectos y % de acierto.
- El nivel de inglés de la entrevista en vivo se guarda aparte y se muestra junto al nivel anterior para comparar; nunca lo reemplaza.
- Una sola evaluación activa por entrevista. Al enviarla queda de solo lectura; solo un Admin puede reabrirla y debe escribir el motivo, que queda en el registro de auditoría.
- Resultado final: Aprobado para el último paso (exige comentarios, red flags y fecha del último roleplay, con recomendación de bono) · Retake (motivo, fecha y comentarios) · No aprobado (una o más razones, comentarios obligatorios si es "Otro"). Al enviar se actualiza el estado del candidato en el flujo actual; en borrador no se cambia nada.

**Fase 2 — Puntajes**
- Puntaje de 100 puntos: inglés 20 · gramática y verbos 20 · demostración de clase 20 · experiencia 15 · disponibilidad y compromiso 15 · valores 10. Los pesos y umbrales se editan desde Ajustes (solo Admin).
- Puntaje de cumplimiento = ítems aplicables completados ÷ ítems aplicables × 100. Los campos de Online no cuentan para candidatos Onsite.
- Se muestran puntaje por categoría, total, nivel en vivo, nivel previo, diferencia entre ambos y cumplimiento. El sistema orienta la decisión pero no decide solo.

**Fase 3 — Recruitment Scorecard**
- Página de reportes con esta semana / semana pasada / este mes / mes pasado / rango personalizado y filtros por evaluador, país, ciudad, modalidad, horario, fuente de referencia, nivel de inglés, resultado y razón de rechazo.
- Tarjetas resumen (entrevistas agendadas, completadas, % de cumplimiento de entrevistas, aprobados, retakes, no aprobados, % de aprobación, promedio de puntaje, de cumplimiento y de Grammar Test, pendientes de entrevista final y de retake).
- Gráficas por semana/mes, evaluador, país, sucursal, modalidad, distribución de nivel de inglés, comparación nivel previo vs. en vivo, principales razones de rechazo, rendimiento por fuente, % con experiencia docente y de call center, cumplimiento de equipo en Online y finalización del Grammar Test.
- Tabla de cumplimiento por evaluador y exportación a CSV con los datos reales del filtro aplicado.

## Detalles técnicos

- Rol: se agrega `evaluator` al enum `app_role`; los permisos se resuelven en el servidor con `has_role` + `staff_countries`, igual que hoy.
- Tablas nuevas (todas con RLS activa, sin acceso anónimo ni de aplicantes, y con GRANTs a `authenticated` y `service_role`):
  `interview_evaluations` (1 por `appointment_id`/`application_id`, estado, tiempos, evaluador, último editor, secciones en JSONB, resultado final, motivos, bono, puntajes y cumplimiento), `evaluation_verbs`, `evaluation_jobs` (1–5), `evaluation_audit` y `scorecard_weights` (fila única editable por Admin).
- Se reutilizan `applications`, `appointments`, `ai_evaluations`, `recruitment_progress`, `work_references`, `countries`, `cities`, `staff_profiles`, `user_roles`, `staff_countries`, `audit_logs`.
- Solo migraciones aditivas; nada se borra ni se renombra.
- Toda la lógica va en server functions (`src/lib/evaluations.functions.ts`, `scorecard.functions.ts`) con `requireSupabaseAuth`; las rutas nuevas viven bajo `_authenticated/`.
- Se reutilizan los mismos colores, tipografía, tarjetas y tablas del panel actual.
- Pruebas al cierre de cada fase: acceso denegado a aplicantes, anónimos, evaluador inactivo y países no permitidos; carga automática de datos; sin duplicar candidatos; autoguardado; campos Online condicionales; experiencia dinámica; cálculo de puntaje y cumplimiento; validación antes de enviar; bloqueo tras envío; reapertura solo por Admin; actualización del estado del candidato; filtros de reportes; exportación con datos reales; y que grabaciones, perfiles, resultados de inglés y agenda sigan funcionando igual.
