# Arreglar: candidato Online aparece en El Salvador y su estado sale vacío

## Qué pasa (revisado en los datos de Luis Adalberto Hernández Hernandez)
- Sí está aprobado: la entrevista de Recruitment dice "Approved", el Manager decidió "Approved for Training" y su estado real es **Approved for Training**.
- **Estado vacío:** la lista "Application status" de la ficha no tiene la opción "Approved for Training" (ni otros estados nuevos como Not Approved/Retake), por eso el cuadro sale en blanco aunque el dato existe.
- **Sale en El Salvador:** en su evaluación del Manager no quedó guardada la modalidad confirmada (se aprobó antes de que existiera ese campo). Sin ese dato, el Training Tracker lo agrupa por país (SV → El Salvador). En su solicitud él sí eligió **Online**.

## Cambios
1. Agregar a la lista de estados de la ficha los estados que el sistema ya usa: "Approved for Training", "Not Approved", "Retake" y "Withdrawn", para que siempre se vea el estado real.
2. En el Training Tracker y Requisiciones: si el Manager no confirmó modalidad, usar la modalidad que el candidato eligió en su proceso (Online/Onsite). La confirmada por el Manager sigue teniendo prioridad.
3. Revisar otros candidatos en Training con el mismo caso para que también se acomoden en su pestaña correcta (sin cambiar datos guardados).

## Detalles técnicos
- `src/lib/recruitment.ts`: ampliar `STATUS_OPTIONS` (también acepta los mismos valores en `setStatus`).
- `src/lib/training.functions.ts`: incluir `recruitment_progress(work_modality)` en el select de `listTrainingRoster` y en la lista de candidatos para llenar spots; `modality = normalizeModality(evidence) ?? normalizeModality(work_modality)`.
- Prueba en `training.test.mjs`: sin modalidad confirmada y `work_modality = online` → grupo ONLINE.
