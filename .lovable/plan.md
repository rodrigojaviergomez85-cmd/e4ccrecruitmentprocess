# Entrar a la entrevista desde el panel (y revisión del contenido actual)

## 1. Lo que ya tiene la entrevista hoy

Secciones en este orden, con autoguardado, barra de progreso y botones Previous/Next:

1. **Candidate and Position** — fecha de entrevista, evaluador, nombre, teléfono, correo, ¿fue referido? (nombre del referidor o fuente Facebook/Instagram/Other), país, ciudad o sucursal, LOB (Online/Onsite), horario seleccionado, fecha de inicio de entrenamiento.
2. **Equipment and Internet** (solo Online) — mínimos recomendados, velocidad de bajada y subida, procesador, RAM, sistema operativo, ¿cumple requisitos? con aviso visible si no, notas del evaluador.
3. **Grammar Test** — completado, puntaje, verificado por el evaluador, cumple el nivel requerido, notas internas.
4. **Profile, Availability and Expectations** — experiencia enseñando inglés, experiencia en call center, horario fijo o variable (con la advertencia de posible descalificación), disponibilidad, acuerdo de pago, las tres preguntas largas (7:30 p.m., rutina diaria, compromiso 1–10 con explicación).
5. **English and Grammar Evaluation** — introducción para el evaluador, verbos irregulares (de 5 a 10, con % de precisión automático), actividades (pregunta en pasado, tiempos, modales, condicionales, comparativos, phrasal verbs, errores y WH questions), class roleplay, prueba de escritura de tres minutos con los tres temas, nivel en vivo A1–C2 comparado con el nivel previo.
6. **Studies** — escuela o universidad, carrera, años, estudios adicionales, certificaciones TESOL/CELTA, notas.
7. **Chronological Job Experience** — hasta 5 posiciones dinámicas, precargadas desde las referencias del candidato y editables.
8. **Goals, Motivation and E4CC Values** — preguntas de motivación y metas, calificación 1–5 de los seis valores, fortalezas, preocupaciones, red flags, comentarios.
9. **Final Result** — Aprobado / Retake / No aprobado con los campos condicionales de cada caso y la recomendación de bono.

Si al comparar con tu Google Form falta alguna pregunta, me la pegas y la agrego; el formulario no se abre desde aquí.

## 2. Poder iniciar la entrevista desde donde ya trabajas

- **Desde la cita agendada**: en la página de entrevistas, cada cita de hoy y próxima tendrá un botón **Start interview** (o **Continue** si ya está empezada, **View** si ya fue enviada) que abre la entrevista de ese candidato.
- **Desde el expediente del candidato**: mismo botón en la ficha del candidato, arriba, junto a sus datos.
- El botón solo aparece para evaluadores y administradores; el permiso real se revisa en el servidor, igual que hoy.

## 3. Panel lateral durante la entrevista

Barra fija a la derecha (y plegable en pantallas pequeñas) con:

- Nombre, teléfono, correo, país, ciudad y modalidad.
- Fecha y hora de la cita, zona horaria del candidato y botón **Join meeting** con el enlace de la reunión.
- Nivel de inglés previo y puntaje, estado del Grammar Test.
- Enlace para abrir el currículum y lista resumida de las referencias de trabajo.
- Estado de la evaluación y aviso de guardado.

## Detalles técnicos

- Nuevo botón de enlace a `/evaluations/$applicationId` desde `src/routes/_authenticated/interviews.tsx` y `src/routes/_authenticated/candidates.$id.tsx`, condicionado a `getEvaluatorAccess`.
- En `interviews.tsx` se necesita el `application_id` y el estado de la evaluación por cita: se amplía la consulta de `interviews.functions.ts` para incluir `interview_evaluations(id, status)` por aplicación (solo lectura, sin cambios de esquema).
- El panel lateral se arma con datos que `openEvaluation` ya devuelve (`candidate`, referencias, cita, nivel previo); se añade únicamente el enlace de la reunión (`appointments.meeting_link`) y la URL firmada del currículum, reutilizando el patrón de `recruiter.functions.ts`.
- Layout del formulario pasa a dos columnas en pantallas grandes (`lg:grid-cols-[1fr_320px]`), con el panel como `Sheet` en móvil. Sin cambios en migraciones, RLS, portal del aplicante ni agenda.
