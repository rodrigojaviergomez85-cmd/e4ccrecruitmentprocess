# Plantilla oficial de correo Retake

## Objetivo

Reemplazar el texto actual del correo de seguimiento **Retake** por la plantilla oficial del equipo de reclutamiento, manteniendo el envío automático al guardar resultado Retake y el envío manual desde la ficha del candidato.

## Cambios

### 1. Nueva plantilla Retake (`src/lib/candidate-emails.ts`)

- Estructura fija del correo:
  - Saludo con el **primer nombre** del candidato.
  - Párrafo de agradecimiento por la entrevista con E4CC.
  - Bloque de retroalimentación: el texto que el evaluador escribe en **Area of opportunity** (pronunciación, gramática, etc.) se inserta tal cual.
  - Sección **Grammar & Pronunciation Resources** con todos los enlaces fijos: Getting Started (Interview Prep Tips, Grammar Topics Document), Grammar Reinforcement (23 videos de YouTube) y Pronunciation Lessons (23 videos).
  - Sección **Before Your Next Interview**: Review Grammar Topics (Drive), Prepare a Sample Class (Online y Onsite), formulario de información personal/referencias (Google Forms), y Grammar Test (TestGorilla).
  - **Next Interview Details**: texto "2 MONTHS FROM NOW" y Zoom link fijo.
  - Cierre "Recruitment Team, E4CC".
- El enlace de reagendamiento (Calendly) se conserva como botón/enlace dentro del correo.
- Todos los enlaces quedan como constantes editables en el archivo para futuros cambios.
- Versión HTML con formato limpio (listas y encabezados), manteniendo el estilo actual.

### 2. Envío manual mejorado

- En la ficha del candidato, al enviar el correo Retake se muestra una **vista previa** del correo con el nombre y el área de oportunidad ya insertados antes de enviar.

### 3. Sin cambios en

- Plantilla **Not approved** (se mantiene la actual).
- Lógica de envío automático al guardar resultado, registro en `candidate_emails`, auditoría y permisos.

## Pendiente de configuración (sin cambios)

- Conectar el correo de salida (API key + remitente del dominio) para que los correos salgan realmente; hasta entonces quedan registrados como fallidos.

## Verificación

- Guardar resultado Retake y confirmar que el correo registrado contiene la plantilla completa con el nombre y el área insertados.
- Enviar manualmente desde la ficha y revisar la vista previa.
- Typecheck y build limpios.
