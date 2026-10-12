# Scorecard: contar todas las entrevistas + métricas de reclutamiento

## Qué está pasando hoy
- El Scorecard solo toma candidatos que **terminaron el screening**. Por eso quedan fuera las entrevistas **manuales** y las de personas que agendaron por Calendly sin screening.
- "Entrevistas agendadas" solo cuenta a quien tiene cita. Una evaluación manual sin cita no suma.
- No se distingue si el candidato **se conectó** o fue No Show.

## Qué cambia

### 1. Conteo de entrevistas
- Se incluye a todos los candidatos que tienen **una cita o una evaluación**, hayan hecho screening o no.
- Cada entrevista se marca según su origen: **Calendly**, **Manual** (evaluación sin cita) o **Manual con cita**.
- Nuevas tarjetas:
  - Agendadas (Calendly + manuales con cita)
  - **Se conectaron** (con evaluación iniciada, sin No Show)
  - No Show / Waiting List / Canceladas
  - Manuales
  - % de asistencia = se conectaron ÷ agendadas
- Las canceladas y reprogramadas no cuentan doble.

### 2. Porcentaje de aprobación
- % de aprobación = aprobados ÷ entrevistas terminadas.
- También % Retake y % No aprobado.
- Desglosado por reclutador, país, modalidad (Online/Onsite) y semana/mes.
- Embudo: agendadas → se conectaron → terminadas → aprobadas en Recruitment → aprobadas por el Manager (Second Filter) → Approved for Training.

### 3. Tipo de perfil aprobado
Para los aprobados se muestra la distribución por:
- Modalidad (Online / Onsite) y país
- Nivel de inglés en vivo (A2, B1, B2, C1…)
- Experiencia: enseñanza, call center, ambas o ninguna
- Ha enseñado a niños (sí/no)
- Fuente de referencia
- Rango de puntaje

### 4. Reporte tipo Scorecard
Nueva sección "Recruitment Scorecard report" en la misma página:
- Tabla por reclutador con: agendadas, se conectaron, % asistencia, terminadas, aprobadas, % aprobación, Retake, No aprobado, AHT promedio, puntaje promedio, cumplimiento.
- Código de color por meta (verde / amarillo / rojo). Metas iniciales sugeridas: asistencia 70 %, aprobación 30 %, cumplimiento 90 %; editables por Admin.
- Mismos filtros de fecha (esta semana, mes, rango) y país.
- Exportar a CSV con origen, asistencia y perfil.

## Sin cambios
Permisos por país, quién ve el Scorecard, evaluaciones guardadas, correos y Calendly.

## Detalles técnicos
- `scorecard.functions.ts`: quitar el filtro `submitted_at not null`; consultar aplicaciones que tengan `appointments` o `interview_evaluations` (dos consultas por id, unidas). Candidatos sin país siguen visibles para reclutadores, igual que en Interviews.
- Por fila: `source` (calendly si `calendly_invitee_uri`, si no manual), `attended` (evaluación existe y cita no `No Show`), estado de cita, resultado del Manager desde `manager_evaluations.final_decision`, AHT desde `handle_seconds`.
- Fecha de referencia: cita, si no `interview_date`, si no `started_at`.
- Metas guardadas en `scorecard_weights.thresholds` (ya existe, solo Admin).
- UI en `routes/_authenticated/scorecard.tsx`: nuevas tarjetas, embudo, perfil aprobado y tabla de metas.
- Pruebas: conteo con entrevista manual sin cita, No Show fuera de "se conectaron", % aprobación, sin dobles por reprogramación.
