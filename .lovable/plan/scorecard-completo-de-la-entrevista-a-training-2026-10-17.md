# Scorecard completo: de la entrevista a Training

Se rehace la página **Scorecard** con 4 pestañas (Resumen, Reclutadores, Country Managers, Training). Se reutilizan citas, evaluaciones de Recruitment, evaluaciones del Manager y Training Tracker. No se borra ni cambia ningún registro histórico, permiso ni la sincronización de Calendly.

## 1. Filtros (aplican a todo)
Fecha (hoy, esta semana, este mes, rango), LOB (Online, El Salvador, Nicaragua, Guatemala), reclutador, country manager, sucursal, origen (Calendly / Manual) y cohorte de training. El LOB sale de la modalidad: un candidato de Guatemala que va a Online cuenta en Online. El país se queda como dato aparte. Las fechas usan la hora de El Salvador y arriba dice "Resultados al … · actualizado …".

## 2. Resumen
- Tarjetas: Agendados por Calendly, Agregados manualmente, Total programadas (sin duplicados), Conectados, Entrevistas realizadas, No show, % conexión general / Calendly / Manual.
- **Conectado** = se abrió la entrevista y no está marcada No Show. **Realizada** = entrevista finalizada. **No show** solo si alguien lo marcó; nunca se adivina por la hora.
- La conexión se calcula solo sobre citas que ya pasaron, sin canceladas ni las citas viejas reprogramadas. Las citas futuras se ven aparte.
- Cada porcentaje muestra su base ("18 de 100 citas elegibles = 18%") y su fórmula al pasar el cursor. Sin base: "— / Sin base".
- Tabla por LOB con las columnas que pediste, separando la decisión de Recruitment (Aprobado / No aprobado / Pendiente) y la del Manager (Pendiente, Agendado, Aprobado, No aprobado). Los pendientes no bajan el porcentaje.
- Pendientes de segundo filtro: tarjeta y tabla ordenada por más tiempo de espera, con 4 grupos (Sin manager, Pendiente de agendar, Agendado, Realizado sin decisión) y botón para abrir el perfil.

## 3. Reclutadores
Tabla LOB → reclutador con todas las columnas pedidas, más un desglose de qué country manager evaluó a sus candidatos. El reclutador es quien hizo la entrevista, no quien está asignado hoy.

## 4. Country Managers
Tabla LOB → manager: recibidos, realizados, aprobados, no aprobados, pendientes y % de aprobación. Cada decisión se le atribuye al Manager que la tomó.

## 5. Training Results
Tarjetas y tabla por LOB y cohorte: reclutados, pendientes de iniciar, iniciaron, activos, dropouts, no show, completaron, y % de inicio, no show, dropout y finalización (siempre con su base). Las cohortes en curso se marcan "En curso".

Para medir esto bien, el Training Tracker necesita datos que hoy no guarda. Se agregan:
- **Incorporación confirmada** (sí/no). Solo así se cuenta como reclutado; no se cuenta a todos los aprobados.
- **Inició training** (fecha de primera asistencia).
- **Fecha y motivo** de dropout o no show, con opción "Sin motivo registrado".
- **Cancelado antes de iniciar** como dato aparte.
- **Historial de cambios de cohorte**, para que un cambio no duplique a la persona.

Los estados actuales (NO SHOW, DROP OUT BEFORE/DURING TRAINING, CERTIFIED, NOT CERTIFIED, etc.) se traducen a estas categorías. Lo que no se pueda saber aparece como "Sin registrar", nunca como no show ni dropout.

## 6. Clic en cualquier número
Al tocar una cifra se abre la lista de candidatos que la forman, con los mismos filtros y permisos. Se exporta a CSV y se mantiene el Excel.

## 7. Datos que tendrás que completar
- En Training: marcar incorporación confirmada, fecha de inicio real y motivo de dropout/no show de las personas que ya están en el tracker.
- Candidatos aprobados sin Manager asignado van a salir en "Sin manager".
- Las entrevistas anteriores que quedaron abiertas sin finalizar van a salir como "Conectado, no realizada".

## Detalles técnicos
- Migración aditiva en `training_roster`: `incorporation_confirmed bool default false`, `started_at date`, `outcome_at date`, `outcome_reason text`, `canceled_before_start bool default false`. Tabla nueva `training_cohort_changes` (application_id, old/new wave_start, changed_by, changed_at) con GRANTs, RLS y escritura solo por el servidor.
- `scorecard.functions.ts` se reescribe a `getRecruitmentMetrics` con páginas de 1000 filas en bucle (sin límite de 500), filtro por país en el servidor, igual que hoy.
- Reglas puras en `scorecard-metrics.ts`: `lobOf`, `connectionEligible`, `recruitmentDecision`, `managerDecision`, `pendingSecondFilterBucket`, `trainingBucket`, `ratio` (con "Sin base").
- Reclutador = `interview_evaluations.evaluator_id` del intento vigente; manager = `manager_evaluations.decided_by` o `manager_id`; una decisión vigente por aplicación y etapa (último intento).
- `getDrilldown` devuelve la lista de una cifra; `exportScorecardCsv` usa los mismos filtros.
- Training Tracker: nuevos campos editables con los permisos de training actuales.
- Pruebas en `scorecard-metrics.test.mjs` para los 9 casos de la sección 11 de tu documento.
