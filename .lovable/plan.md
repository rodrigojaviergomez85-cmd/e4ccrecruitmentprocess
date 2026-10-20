# Arreglar: cada pestaña de país muestra solo sus cupos

## Causa
En Training Tracker, los candidatos sí se filtran por la pestaña (NICARAGUA, GUATEMALA, etc.). Los cupos **PENDIENTE DE RECLUTAR** no se filtran: siempre salen todos. Por eso, en NICARAGUA aparecen la sección ONLINE y sus 22 cupos.

## Cambios
1. Los cupos pendientes respetan la pestaña elegida: NICARAGUA muestra solo cupos de Nicaragua, ONLINE solo los de Online, y TODOS muestra todo.
2. La **Meta de reclutamiento** también sigue la pestaña: en NICARAGUA verás solo la meta de Nicaragua y su mínimo semanal. En TODOS sigue el total de ONLINE y ONSITE.
3. Junto al nombre de cada pestaña verás también los cupos pendientes, por ejemplo "NICARAGUA 4 · 1 cupo".
4. Revisaré en pantalla cada pestaña.

## Detalles técnicos
- `training.tsx`: en el cálculo de `pending`, agregar `lob === "all" || group === lob`.
- `RecruitmentGoal` recibe una propiedad opcional `group` y filtra `open`/`upcoming` por ella. En Applicants sigue sin filtro.
