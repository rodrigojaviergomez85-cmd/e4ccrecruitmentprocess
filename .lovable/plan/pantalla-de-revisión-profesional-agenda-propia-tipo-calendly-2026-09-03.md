# Pantalla de revisión profesional + agenda propia tipo Calendly

## Acceso al sitio

- Sitio publicado: https://english-kids-spark.lovable.app
- Aplicación de candidatos: /apply
- Acceso del equipo (login staff): /auth → panel en /dashboard e /interviews

## Recomendación sobre Calendly

Ya existe un agendador propio dentro de la app (página segura /schedule/:token, disponibilidad configurable, asignación de entrevistador, confirmación y recordatorios). Enviar a Calendly externo perdería la validación de nivel B2+, el enlace seguro por candidato y el registro en el panel. La recomendación es mantener el agendador interno y terminar de pulirlo.

## 1. Pantalla "estamos revisando" (mientras corre la evaluación)

En la pantalla final de /apply, mientras el resultado está pendiente:

- Quitar el botón "Back to home" durante la revisión.
- Mensaje claro y profesional en inglés:
  - Título: "We're reviewing your application"
  - Texto: "Our team is reviewing your English performance right now. This usually takes 2–3 minutes. Please stay on this page — as soon as the review is complete you'll be able to book your interview with the E4CC recruitment team."
- Barra de progreso animada con tiempo estimado y contador de espera.
- Lista de pasos con estado: perfil enviado, videos recibidos, revisión en curso, resultado.
- Aviso "Do not close this window".
- Si la revisión tarda más de lo esperado: mensaje de que también recibirá el resultado por correo (sin botón de salida que corte el flujo).

Resultados:
- Nivel suficiente: pantalla de felicitación con botón "Schedule your interview" (ya existe, se refuerza el diseño y se indica que también se envió por correo).
- Nivel insuficiente: agradecimiento profesional y allí sí un botón para volver al inicio.

## 2. Calendario tipo Calendly (ajustes)

- Página del candidato: elegir día en un calendario mensual y hora en su zona horaria, con confirmación que muestra fecha, hora, entrevistador y enlace de reunión.
- Horarios controlados desde Ajustes de administrador: días y horas semanales, duración, descansos, fechas bloqueadas, cupos por horario, entrevistadores y enlace de reunión.
- Confirmación automática por correo al agendar, más recordatorios 24 h y 1 h antes.

## Detalles técnicos

- Cambios de interfaz en `src/routes/apply.tsx` (componente `DoneScreen`): estados de revisión, progreso, textos y eliminación del botón durante la espera.
- Reutilizar los tokens de diseño existentes; sin cambios de esquema ni de lógica de evaluación.
- Agenda y recordatorios ya implementados en `src/routes/schedule.$token.tsx`, `src/lib/scheduling.server.ts` y el cron `/api/public/cron/reminders`; se pulen textos y confirmación.
- El envío de correo requiere tener configurado el proveedor de email; WhatsApp queda como "no configurado" hasta añadir credenciales.
