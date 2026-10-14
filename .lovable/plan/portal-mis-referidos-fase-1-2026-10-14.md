# Portal "Mis referidos" (Fase 1)

Los colaboradores siguen refiriendo con su Google Form actual. La plataforma trae esas respuestas, Recruitment las revisa y el colaborador consulta el estado de sus referidos con un código que le llega por correo. No se crean cuentas ni contraseñas.

## 1. Traer referidos desde Google Sheets
- Se conecta la hoja de respuestas del formulario (necesito el enlace de la hoja).
- Botón "Importar referidos" en una nueva pantalla interna **Referrals**, además de una importación automática cada hora.
- Cada fila guarda la hoja y el número de fila de origen, así repetir la importación no duplica.
- Primero se muestra una vista previa: filas nuevas, filas con errores (fechas raras, #REF!, correo inválido) y filas ya importadas. Nada se corrige adivinando.
- El referido se vincula a un candidato existente por correo. Si no existe, queda como "sin candidato" hasta que Recruitment lo vincule. No se crean candidatos duplicados ni se fusionan personas por nombre.

## 2. Pantalla interna Referrals (Recruitment y Admin)
- Lista: referidor, correo del referidor, candidato referido, estado público, estado del bono, fecha de actualización.
- Recruitment puede validar el correo del referidor (incluido correo personal), vincular el candidato correcto y marcar casos en disputa.
- Solo los referidores con correo validado pueden consultar el portal.

## 3. Portal del colaborador (página pública /mis-referidos)
- Campo de correo y botón "Enviar código". Código de 6 dígitos, válido 10 minutos, un solo uso, máximo 5 intentos y límite de envíos. Enviar uno nuevo anula el anterior. La respuesta es la misma exista o no el correo.
- Envío por el mismo canal de Make que ya usan los códigos de Retake.
- Al validar, sesión de consulta de 2 horas con botón "Cerrar sesión".
- Muestra: nombre del referidor y, por cada referido, nombre, estado público, fecha de última actualización y estado del bono. Sin importes, teléfonos, correos del candidato, evaluaciones ni motivos.
- Confirmación por correo al referidor cuando su referido entra al módulo, con enlace al portal.

## 4. Estados públicos
Mapeo desde el proceso interno: Recibido, En contacto, Entrevista pendiente, En evaluación, Retake pendiente, Aprobado para training, En training, Certificado, Proceso finalizado (mensaje neutral, sin motivo).
Estado del bono: En validación, En espera, En revisión, Reportado, Pagado. Por ahora se fija manualmente en Referrals; el cálculo de cuotas llega en la Fase 2.

## Fase 2 (siguiente entrega, no incluida aquí)
Bonos de contratación y por referido con cuotas $500 / $200 / $100 contadas desde la certificación real (mes calendario), estados de reporte y pago, y recordatorios los días 12 y 25 a las 9:00 AM para Admin y Recruitment. Tomo como confirmado que el bono por referido usa la misma tabla de cuotas.

## Cambios al formulario "REFER A FRIEND"
El formulario actual pide nombre y teléfono, pero no correos. Agregar dos preguntas obligatorias:
- **Tu correo electrónico** (para enviarte el código y ver tus referidos).
- **Correo electrónico de tu referido/a** (para enlazarlo con su candidatura sin confundir personas).
Los referidos antiguos sin correo quedan internos hasta que Recruitment valide el correo del referidor.

## Pendiente de ti
- Agregar esas dos preguntas al formulario.
- Enlace de la hoja de Google donde caen las respuestas (Respuestas > Ver en Hojas de cálculo).

## Detalles técnicos
- Conector Google Sheets (cuenta del equipo); lectura con batchGet en servidor, sin sondeo desde el navegador.
- Tablas nuevas: `referrers` (correo normalizado, validado_por/en), `referrals` (referrer_id, application_id nullable, source_sheet/source_row único, bonus_status, raw jsonb), `referral_access_codes` (hash, expiración, intentos, used_at), `referral_sessions` (hash del token, expiración). RLS: personal completo vía `is_active_staff`; tablas de códigos/sesiones sin acceso desde el navegador.
- Portal: server functions públicas que validan código/sesión por hash (cookie httpOnly) y derivan el referidor desde la sesión, nunca desde un ID enviado por el cliente; devuelven un DTO con solo los campos públicos.
- Pruebas: mapeo de estados, códigos vencidos/reutilizados/intentos, aislamiento entre referidores, importación repetida sin duplicados.
