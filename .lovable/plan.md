# Ocultar sucursales sin requisición en el resumen de Training

## Qué cambia
En el resumen por sucursal del Training Tracker (todas las pestañas: El Salvador, Guatemala, Nicaragua, Online), solo aparecen las sucursales que tienen requisición, reclutados o personas en training en el periodo elegido. Las filas con todo en cero desaparecen.

En el ejemplo de El Salvador quedarían solo: San Marcos, Plaza Lourdes, Plaza Merliot y TOTAL. Así ya no salen las repetidas en cero (Merliot, Lourdes, etc.).

El TOTAL no cambia.

## Detalle técnico
- `src/routes/_authenticated/training.tsx`, `BranchSummary`: el filtro `g !== "ONLINE" || ...` se cambia por `l.v.req || l.v.rec || l.v.tr || l.v.pend` para todos los grupos.
