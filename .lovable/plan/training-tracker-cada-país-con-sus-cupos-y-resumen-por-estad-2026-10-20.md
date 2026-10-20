# Training Tracker: cada país con sus cupos y resumen por estado

## Causa del problema
Los candidatos ya se filtran por pestaña. Los cupos **PENDIENTE DE RECLUTAR** no se filtran y siempre salen todos. Por eso, en NICARAGUA aparecen los 22 cupos de ONLINE.

## Cambios
1. **Cupos por pestaña:** cada pestaña muestra solo sus cupos. Por ejemplo, NICARAGUA solo muestra los de Nicaragua.
2. **Orden de pestañas:** primero cada LOB y al final TODOS: ONLINE, EL SALVADOR, NICARAGUA, GUATEMALA y TODOS. Al entrar se abre la primera, ONLINE.
3. **Resumen arriba**, según la pestaña elegida:
   - Conteos por estado: Pendiente de reclutar, Reclutado, In Training, No Show, Drop out before, Drop out during, Certified, Not Certified y Banca.
   - Cada número muestra cuánto representa del total de esa pestaña, por ejemplo "In Training 5 · 31%".
   - En TODOS hay una tabla con una fila por LOB y una fila de Total, con las mismas columnas y porcentajes.
   - Puedes ver los datos **Por wave** (inicio de training) o **Por mes**, y elegir uno específico o "Todos".
4. **Meta de reclutamiento:** sigue la pestaña elegida. En TODOS muestra el total de ONLINE y ONSITE.
5. Revisaré en pantalla cada pestaña y que los totales coincidan con la lista.

## Detalles técnicos
- `training.tsx`: filtrar `pending` con `lob === "all" || group === lob`. Las pestañas quedan como `[...groupNames, "all"]`, con `ONLINE` por defecto. Agregar el selector Wave/Mes, que filtra filas y cupos por `waveStart` o `YYYY-MM`.
- Nueva función `statusSummary(rows, pending)` en `training.ts`, con conteo y % por estado. Tendrá una prueba.
- `RecruitmentGoal` recibe la prop opcional `group`. En Applicants seguirá sin filtro.
