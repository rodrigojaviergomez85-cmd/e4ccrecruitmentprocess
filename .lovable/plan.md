# Ajustes al E4CC Recruitment Process

Cambios sobre la página `/process/$id` y su backend (`src/lib/process.functions.ts`). Sin tocar módulos 1 y 2 ni la identidad visual.

## 1. Quitar la sección Sample Class Preparation

- Se elimina por completo la sección 5 (texto, botón al video de YouTube y checkbox) de `src/routes/process.$id.tsx`.
- `sample_class_confirmed` deja de ser requisito para desbloquear la agenda: se quita del checklist en `requirementsFor()` (server) y de la UI. La columna se conserva en la base de datos (no se borra data existente).
- Las secciones se renumeran: 5 pasa a ser "Schedule Your Interview".

## 2. Device Requirement: Online vs Onsite + datos técnicos

Dentro de la sección 1, antes del checkbox, se agrega la pregunta **"Is your coaching position Online or Onsite?"** (selector Online / Onsite), guardada en `recruitment_progress.work_modality`.

**Si elige Online**, además del checkbox existente se pide:

- **Internet speed**: el sistema intenta detectarla automáticamente desde el navegador (descarga de prueba cronometrada + Network Information API como respaldo) y muestra el resultado en Mbps; el candidato puede volver a correr la prueba. El valor se guarda en `internet_speed_mbps`.
- **Processor y RAM**: el candidato abre System Information en su computadora, toma una captura de pantalla y la sube (JPG/PNG, máx. 10 MB) al bucket privado `candidate-media` bajo la carpeta de su aplicación, con URL firmada igual que el resume. Se muestra el nombre del archivo y puede reemplazarlo. Guardado en `system_info_path` / `system_info_filename`.

**Si elige Onsite**: no se piden datos técnicos ni captura; solo el checkbox de dispositivo.

La sección cuenta como completa (server-side) cuando: `device_confirmed` = true **y** (modality = Onsite **o** (modality = Online con velocidad registrada **y** captura subida)).

En el dashboard del reclutador (`candidates.$id.tsx`) se muestra: modalidad, velocidad detectada y botón para abrir la captura vía URL firmada temporal.

## 3. Work References: quitar dos campos

- Se eliminan del formulario "Supervisor's position" y "Country" (UI, `referenceSchema`, `referenceComplete` y el detalle del reclutador).
- Migración: `ALTER TABLE work_references` para hacer `supervisor_position` y `country_code` opcionales (nullable). Los datos ya guardados se conservan.
- Campos que permanecen: company, position, start/end date o "Currently working here", supervisor name, supervisor phone/WhatsApp, supervisor email, reason for leaving, may_contact.

## Migración (aditiva)

```text
recruitment_progress:
  + work_modality text ('online' | 'onsite')
  + internet_speed_mbps numeric
  + system_info_path text
  + system_info_filename text
  + system_info_uploaded_at timestamptz
work_references:
  supervisor_position -> nullable
  country_code -> nullable
```

## Archivos a tocar

- Migración nueva (ALTERs aditivos, sin GRANTs nuevos: las tablas ya existen).
- `src/lib/process.functions.ts`: schemas, `referenceComplete`, `requirementsFor`, nuevo server fn `createSystemInfoUploadTarget` + `saveSystemInfo`, y `saveRecruitmentProgress` acepta `work_modality` / `internet_speed_mbps`.
- `src/routes/process.$id.tsx`: quitar sección 5, nueva UI de Device Requirement, formulario de referencias sin los dos campos, renumerar secciones.
- `src/lib/recruiter.functions.ts` + `src/routes/_authenticated/candidates.$id.tsx`: mostrar modalidad, Mbps y captura con URL firmada; referencias sin supervisor position/country.

## Verificación

- `tsgo` y build OK.
- A1/A2 siguen bloqueados; B1+ accede.
- Desbloqueo de agenda valida los nuevos requisitos en servidor.
- Progreso persiste al salir y volver.
