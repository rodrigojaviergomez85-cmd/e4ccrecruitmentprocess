# Convenios personalizados en el correo de bienvenida

## Qué verás
- Al elegir **Approved for Training**, el Manager revisa los datos del convenio, ve una vista previa y pulsa **Confirm and finish**.
- El candidato recibe **un solo correo** de bienvenida con su convenio en PDF adjunto: Online recibe solo el Online y Onsite solo el Onsite.
- El expediente muestra el PDF, la plantilla y versión, los datos usados, las fechas y el estado ("Generated", "Sent", "Pending – agreement"). Nunca se marca como firmado.

## Convenio Online
- Datos que cambian: nombre completo, fecha de inicio de Training y Trainer.
- Horarios fijos (iguales en formulario, PDF y correo): Training lunes a viernes 5:00–9:00 p. m.; disponibilidad de clases 6:30–9:35 p. m.; empieza con una clase fija de 8:05–9:35 p. m.; clase adicional de 6:30–8:00 p. m. según desempeño y demanda. Zona horaria UTC−6. Sin sucursal.

## Convenio Onsite
- Datos que cambian: nombre, fecha de inicio, días y horario de Training, LOB / tipo de plaza, sucursal de Training, sucursal donde dará clases (con la casilla "Same as training branch"), días y horario de clases y Trainer.
- Se reemplazan el nombre de ejemplo ("Chrisstick…") y los horarios de ejemplo; no queda ningún horario viejo que los contradiga.
- **"cincuenta (40) horas"** se corrige a **"cuarenta (40) horas"**: el 50 % de los honorarios se paga al completar 40 horas. Onsite ya no queda bloqueado por esto.

## PDF
- La app crea el PDF por su cuenta, con un diseño limpio de E4CC: el mismo texto, las mismas cláusulas y las mismas tablas (Addendum A y B), más un bloque corto de "Datos del participante". Nombre, firma y fecha de firma quedan en blanco para el candidato.
- Las plantillas Word se guardan como versión "2026-09" y se conservan los documentos anteriores.

## Envío y fallos
- Se guarda la decisión, después se crea el PDF en almacenamiento privado y por último se envía el correo con un enlace seguro temporal que Make usa para adjuntar el archivo.
- Si falla la creación del PDF o el adjunto, la decisión queda guardada y el correo se marca como "pendiente por convenio". No sale ninguna bienvenida incompleta. "Retry" reintenta sin duplicar.
- No se reenvía nada a candidatos que ya fueron aprobados.

## Lo que necesito de ti en Make
En el escenario de Outlook hay que añadir un paso "HTTP → Get a file" con `attachment_url` y conectar ese archivo al campo Attachments de Outlook. Te daré la guía paso a paso y lo comprobaré con un envío a kennia.vasquez@e4ccglobal.com.

## Verificación
- Una muestra Online y otra Onsite con datos TEST, revisadas página por página (sin nombres de ejemplo, campos vacíos, horarios que se contradigan ni texto cortado). Te las entrego para que las revises.
- Un correo de prueba con el adjunto, enviado solo a kennia.vasquez@e4ccglobal.com.

## Technical details
- `src/lib/agreements/` contiene el texto de las plantillas con versión, junto con `buildAgreement(kind, data)` hecho con pdf-lib + fontkit y una fuente TTF compatible con Unicode (funciona en Worker).
- Una migración crea `candidate_agreements` (application_id, kind, template_version, data jsonb, storage_path, status, generated_at, sent_at, email_id) con GRANTs y RLS por rol/país, además de un bucket privado `agreements`.
- `applyDecision` para Approved: guarda la decisión → genera el PDF → crea un signed URL de 7 días → envía el payload a Make con `attachment_url` y `attachment_name`. Es idempotente por application_id + kind. Los campos de Training de Onsite se añaden a TRAINING_KEYS y se validan.
- La constante `ONSITE_HOURS_CONFIRMED=false` bloquea los envíos reales de Onsite.
