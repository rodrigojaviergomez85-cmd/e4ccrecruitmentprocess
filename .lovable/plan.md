# Conectar correo Lovable para reclutamiento@e4ccglobal.com

## Objetivo

Activar el envío real de correos desde **reclutamiento@e4ccglobal.com** usando la infraestructura de correo gestionada de Lovable, reemplazando las llamadas directas a Resend que actualmente no envían nada (no hay `RESEND_API_KEY` configurada).

## Estado actual verificado

- `src/lib/notify.server.ts`: `sendEmail()` hace `fetch` directo a `api.resend.com/emails` con `RESEND_API_KEY` + `EMAIL_FROM`. Sin la key, devuelve `skipped` y nada sale.
- 7 call sites usan `sendEmail()`: retake access code, preparation email (Calendly sync), resend preparation, follow-up retake/not_approved, scheduling invites/reminders, y envío manual desde la ficha del candidato.
- La tabla `candidate_emails` tiene `kind` y `status` como `text` sin CHECK constraint, así que `"preparation"`, `"sent"`, `"failed"`, `"skipped"`, `"resent"` son todos válidos.
- No hay dominio de correo configurado en el workspace.

## Pasos

### 1. Configurar dominio de correo (acción del usuario)

Abrir el asistente de configuración de correo para **e4ccglobal.com**. El usuario añade los registros DNS que Lovable indique (SPF, DKIM, DMARC) en su proveedor de DNS. La verificación es automática; puede tardar hasta 72 horas pero suele ser minutos.

### 2. Activar correos del proyecto

Llamar `email_domain--toggle_project_emails` para habilitar el envío gestionado en este proyecto.

### 3. Scaffold de infraestructura de correo transaccional

Llamar `email_domain--scaffold_transactional_email_templates` para crear el helper de envío gestionado con `@lovable.dev/email-js`. Esto genera el módulo de envío con la URL y autenticación correctas.

### 4. Reescribir `sendEmail` en `src/lib/notify.server.ts`

- Reemplazar el `fetch` a Resend por el helper gestionado de Lovable (`sendLovableEmail` o el helper scaffoldeado).
- `emailConfigured()` deja de revisar `RESEND_API_KEY` y verifica la configuración de Lovable (dominio activo).
- El remitente queda como `reclutamiento@e4ccglobal.com` (usando el dominio verificado).
- **La firma de `sendEmail` no cambia** (`{ to, subject, html }` → `SendResult`), así los 7 call sites siguen funcionando sin editarlos.
- `sendWhatsApp` y `baseUrl()` se mantienen intactos.
- Corregir `baseUrl()` que aún apunta a `english-kids-spark.lovable.app` → usar la URL publicada de E4CC.

### 5. Verificar

- Comprobar que `email_domain--check_email_domain_status` reporta el dominio verificado y el envío activo.
- Probar el envío del correo de preparación (reservar una cita en Calendly o usar "Resend Preparation Email").
- Probar el código de acceso Retake (flujo `/retake`).
- Verificar que `candidate_emails` registra estado `sent` (no `skipped`/`failed`).
- Revisar logs en Cloud → Emails.
- Typecheck y build limpios.

## Sin cambios

- Plantillas de correo (`candidate-emails.ts`): el HTML generado se mantiene igual.
- Todos los call sites de `sendEmail`: no se editan.
- Lógica de Calendly, evaluaciones, retake recovery, dashboard.
- Auth emails: Lovable envía los correos de auth por defecto; no se necesita `scaffold_auth_email_templates` a menos que se quiera personalizar el diseño.
