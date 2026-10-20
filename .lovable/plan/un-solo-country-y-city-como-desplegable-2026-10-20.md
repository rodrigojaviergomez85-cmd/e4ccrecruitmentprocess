# Un solo Country y City como desplegable

## Qué cambia en la entrevista de Recruitment
- **Country:** queda solo el de arriba ("Candidate country", editable con "Save candidate details"). El segundo campo "Country" vacío desaparece.
- **City:** deja de ser texto libre. Pasa a ser un desplegable con las ciudades del país elegido arriba, más "Other city" (abre un campo para escribirla).
  - Si se cambia el país, la ciudad se limpia y la lista se actualiza.
  - Sin país elegido, el desplegable dice "Select country first".
- **Assigned branch:** se mantiene separado: Onsite = sucursales oficiales del país (NI, SV, GT); Online = "Online".
- La ciudad se guarda junto con nombre, correo, teléfono y país en el expediente del candidato (queda en el Audit Log).

## Verificación
- Abrir la entrevista de Miguel Angel Ruiz Betran (Nicaragua) y confirmar: un solo Country, City con ciudades de Nicaragua, guardado persiste al recargar.
- Nota: la captura muestra la versión anterior; el cambio de ayer ya quitó parte del duplicado en la vista previa. Para que el equipo lo vea en la app publicada hay que publicar.

## Detalles técnicos
- `evaluations.$applicationId.tsx`: estado de contacto gana `city_id` / `city_other`; `useCities(contact.country_code)` + `SearchSelect`.
- `candidate-contact.ts` y `updateInterviewCandidateContact`: aceptar `city_id` (validado contra `cities` del país) o `city_other`, actualizando `city`, `city_id`, `city_other`.
- Revisar que no quede ningún campo "Country"/"City" de la guía guardado en `answers` que se renderice aparte.
