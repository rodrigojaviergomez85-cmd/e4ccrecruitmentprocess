# Un solo botón para terminar la entrevista: Finish interview

## Problema
Hoy hay dos formas de cerrar la entrevista de Recruitment:
- **Submit evaluation** (al final del último paso): envía directo, sin abrir la ventana donde se escribe la razón del Retake ni la fecha/hora de la última entrevista con el Trainer.
- **Finish interview**: abre esa ventana con todos los campos según el resultado.

Por eso al usar Submit no aparecen esos campos.

## Cambio
- Quitar el botón **Submit evaluation**.
- En el último paso, en lugar de Submit, se verá solo **Finish interview** (como botón principal), que abre la misma ventana de siempre:
  - **Approved for last step** → fecha/hora de la entrevista final con el Trainer/Manager y comentarios.
  - **Retake required** → razón del retake, áreas a mejorar, fecha de retake y comentarios.
  - **Not approved** → motivos y comentarios.
- En los demás pasos Finish interview sigue disponible igual que ahora (finalización anticipada).
- Al confirmar en la ventana se guarda todo, se detiene el reloj del AHT, cambia el estado del candidato y la entrevista queda bloqueada, igual que hoy.

## Sin cambios
- Save draft, Previous/Next, Red Flags lateral, correos, permisos, reapertura por Admin y entrevistas ya enviadas.

## Detalle técnico
- En `evaluations.$applicationId.tsx` reemplazar el botón Submit del último paso por un botón que abre `finishOpen`; ocultar el botón Finish duplicado en ese paso.
- La ventana usa la validación de finalización por resultado (`missingEarlyFinish`), así nunca exige campos de secciones no aplicables.
