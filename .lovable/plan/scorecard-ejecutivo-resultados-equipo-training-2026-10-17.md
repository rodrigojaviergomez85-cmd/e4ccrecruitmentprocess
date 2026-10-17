# Scorecard ejecutivo: Resultados | Equipo | Training

Se rediseña el Scorecard actual sobre los mismos datos y reglas de conteo. El detalle operativo se conserva al hacer clic en cada cifra, junto con la exportación CSV/Excel y los permisos por país.

## 1. Navegación y filtros
- Tres pestañas: **Resultados | Equipo | Training**.
- A la vista: **Periodo** y **LOB** (Online, El Salvador, Nicaragua, Guatemala).
- En "Más filtros": reclutador, manager, sucursal, origen y cohorte.
- Fecha de corte y última actualización en letra pequeña.

## 2. Resultados
**Seis tarjetas** (cada una abre su lista de candidatos):
1. Entrevistas realizadas (entrevistas iniciales finalizadas).
2. Conexión: "X conectados de Y citas elegibles"; el detalle separa Calendly y Manual.
3. Aprobados finales (por Country Manager), con % sobre decisiones cerradas.
4. Iniciaron training, con conversión desde aprobados finales (misma población).
5. Pendientes de segundo filtro.
6. Pérdidas de training: no shows y dropouts por separado.

**Tabla por LOB**: Entrevistados · Aprobados finales · Iniciaron training · Conversión a training · Pendientes 2.º filtro · % Perfil A, más una fila TOTAL. El total se calcula con numeradores y denominadores sumados, nunca con un promedio. Los que tienen inicio futuro se marcan "Inicio próximo" y no cuentan como pérdida.

**Calidad de candidatos evaluados (A/B/C)**: número y % de A, B y C sobre los clasificados, "Sin clasificar" aparte y la cobertura "X de Y entrevistados clasificados". Se puede ver por LOB y por reclutador, y filtrar la lista por perfil.

**Puntos de atención**: hasta 3 hallazgos calculados con los datos (pendientes de 2.º filtro con más días de espera, la pérdida entre aprobación e inicio y el motivo de abandono más frecuente, si está registrado). No se inventan causas.

## 3. Clasificación A/B/C (nueva, manual)
El proyecto no tiene hoy reglas A/B/C, así que se agrega una clasificación manual:
- **A — Alto ajuste**, **B — Ajuste con brechas**, **C — Bajo ajuste actual**. Admin puede editar los textos de las etiquetas.
- Se clasifica al final de la entrevista de Recruitment y en la del Manager. Se guarda la letra, quién la puso, la fecha y una justificación breve (obligatoria).
- Las dos clasificaciones quedan separadas. La del Manager vale como final cuando existe.
- No hay umbrales numéricos ni clasificación automática por resultado. Se cuenta una vez por candidato y aplicación (el intento vigente).

## 4. Equipo
Selector **Reclutadores | Country Managers**.
- **Reclutadores**: Entrevistas · Aprobados Recruitment · Aprobados manager · % aprobación manager · Iniciaron training. Al expandir la fila se ven los pendientes de 2.º filtro y la distribución A/B/C.
- **Country Managers**: Evaluados · Aprobados · % aprobación · Pendientes · Iniciaron training. Cada decisión se atribuye a quien la tomó.
- Los porcentajes llevan su base, por ejemplo "80% · 4/5".

## 5. Training
Tabla por LOB y cohorte: Confirmados · Iniciaron · Activos · Completaron · No show · Dropout. Debajo, solo dos porcentajes:
- **% no show** = no shows ÷ incorporaciones esperadas cuya fecha de inicio ya llegó.
- **% dropout** = abandonos después de iniciar ÷ personas que iniciaron.

Al abrir los no shows o dropouts se ven los candidatos con su motivo. Si falta información se muestra "Sin datos registrados", no un cero.

## 6. Diseño
Números grandes, etiquetas cortas y fórmulas en tooltips. Colores sobrios, sin semáforos (no hay metas configuradas). Las tablas caben sin desplazamiento horizontal en computadora. Se quitan las tarjetas repetidas y los textos técnicos.

## 7. Validación antes de entregar
- Pruebas automáticas: conversión con la misma población, TOTAL calculado con totales, conexión sin citas futuras ni canceladas, aprobaciones sin pendientes, A/B/C contado una vez y con prioridad del Manager, inicio futuro que no cuenta como pérdida, y una persona sin duplicar por reprogramación o por Calendly más registro manual.
- En pantalla, con tu cuenta: que las tarjetas, la tabla por LOB y las listas de cada cifra den los mismos números con los mismos filtros.

## Detalles técnicos
- Migración aditiva: se agregan `profile_tier text check in ('A','B','C')`, `profile_tier_reason text`, `profile_tier_by uuid` y `profile_tier_at timestamptz` a `interview_evaluations` y a `manager_evaluations`. Las etiquetas editables se guardan en `scorecard_weights.thresholds.tierLabels` (sin tabla nueva).
- La clasificación se guarda en las funciones de servidor existentes de guardar/finalizar, con los permisos actuales y registro en el audit.
- `metrics.functions.ts` agrega a `MetricRow`: `recruitmentTier`, `managerTier`, `finalTier` y `startDateFuture`.
- Reglas puras nuevas en `scorecard-metrics.ts`: `finalTier`, `conversionToTraining`, `sumRatio` y `attentionPoints`, con sus pruebas en `scorecard-metrics.test.mjs`.
- `RecruitmentMetrics.tsx` se reescribe en 3 pestañas; se reutiliza la lista de cada cifra (drilldown) y la exportación CSV/Excel.
