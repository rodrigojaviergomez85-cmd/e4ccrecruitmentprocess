# Experiencia de teaching/training + call center con regla de elegibilidad

## Qué cambia en el formulario

- El campo actual pasa a llamarse **"Teaching or training experience"** (incluye entrenamiento corporativo, tutorías, capacitación interna).
- **Call center experience** deja de ser un switch sí/no y pasa a ser un dropdown igual al de teaching.
- Ambos dropdowns usan las mismas opciones de duración:
  - No experience
  - Less than 6 months
  - 6–11 months
  - 1–2 years
  - 3–5 years
  - More than 5 years

## Regla de elegibilidad (validada en el servidor)

Se puede continuar si:

- Teaching/training es de **1 año o más**, o
- Call center es de **1 año o más** y teaching/training es de **al menos 6 meses**.

En cualquier otro caso (por ejemplo: sin call center y menos de 1 año de teaching) el candidato **no aplica**.

La regla se evalúa tanto en el formulario como en el servidor, para que nadie la pueda saltar.

## Qué ve quien no califica

- Se guarda su aplicación con estado **Not eligible** (para métricas), incluyendo país, ciudad, teléfono y consentimiento.
- No pasa a la revisión de medios ni a la grabación de videos.
- Ve una pantalla profesional de agradecimiento: gracias por aplicar, pero se requiere al menos 1 año de experiencia en enseñanza o training (o 1 año de call center junto con 6 meses de enseñanza) para este rol, e invitación a postularse de nuevo cuando cumpla el requisito.

## Dashboard del reclutador

- El filtro de "Call center experience" pasa de sí/no a filtro por rango de duración.
- Las tarjetas y la ficha del candidato muestran ambos rangos (teaching y call center).
- Se agrega "Not eligible" a los estados filtrables para poder revisarlos aparte.

## Detalles técnicos

- Migración aditiva: `applications.callcenter_experience_level` (texto) manteniendo la columna booleana existente para no perder datos; backfill: `true` → `1–2 years`, `false` → `No experience`. Se agrega `Not eligible` como estado permitido.
- `src/lib/recruitment.ts`: nuevas `EXPERIENCE_OPTIONS`, mapa `experienceMonths` y función `isEligible(teaching, callcenter)` compartida por cliente y servidor. Las opciones antiguas ("Less than 1 year") se mapean para registros existentes.
- `src/routes/apply.tsx`: switch reemplazado por `Select`, nuevo paso `not-eligible`, la etiqueta del campo de teaching se actualiza.
- `src/lib/candidate.functions.ts`: `createApplication` valida la regla, guarda el nivel de call center y, si no califica, crea la aplicación con estado `Not eligible` y devuelve `eligible: false` sin token de subida.
- `src/lib/recruiter.functions.ts` y `dashboard.tsx`/`candidates.$id.tsx`: filtro y visualización por rango.
- Se conserva intacto el flujo de video, evaluación IA y datos existentes.
