# Rediseño de lectura: Recruitment Interview y Manager Final Interview

Objetivo: que cualquier persona lea el expediente y haga la entrevista al 100 % de zoom, sin perder datos, permisos ni privacidad. No cambian decisiones, correos ni lo que se guarda.

## 1. Encabezado limpio (ambas pantallas)
- Nombre del candidato como título grande; estado y "Withdrawn" como etiquetas.
- Debajo, una cuadrícula de bloques con etiqueta + valor: País, Modalidad, Plaza/Sucursal, Correo, Teléfono, Reclutador, Manager, Cita / Final filter, Grammar Test, Nivel de inglés (AI), Resultado de Recruitment.
- Botones visibles: Abrir CV, Volver a la cola.
- Texto base de 16 px, etiquetas de 14 px, títulos de sección más grandes y más espacio. Se quitan los textos de 12 px en contenido de lectura.

## 2. Nueva sección para el Manager: "Entrevista de Recruitment y expediente del candidato"
- A todo el ancho, antes de las seis etapas. Se quita el desplegable pequeño de dentro de Reconfirmation.
- Resumen inicial: disponibilidad, horarios, experiencia, resultado de Recruitment y pendientes de verificación.
- Red flags internos en un recuadro rojo, marcados "Interno — nunca se envía al candidato".
- Botón grande "Ver entrevista completa de Recruitment" que la abre en la misma página, a todo el ancho (y "Ocultar"). El borrador del Manager no se pierde.

## 3. Entrevista completa en formato de lectura
Secciones en este orden, cada pregunta con su respuesta completa (párrafos y saltos de línea respetados), y "No registrado" cuando falte:
1. Perfil, modalidad, disponibilidad y expectativas de la posición (incluye internet y equipo si es Online).
2. Metas y motivación.
3. Inglés, gramática, verbos y demo (incluye writing y reading).
4. Estudios.
5. Historial laboral — Método A: una tarjeta por empleo en orden cronológico con empresa, puesto, fechas y duración, responsabilidades, logros/resultados, dificultades, supervisor, calificación declarada y su motivo, motivo de salida y periodos sin empleo. Reemplaza la tabla ancha con scroll.
6. Valores y preguntas del candidato.
7. Referencias (tarjetas con contacto y estado de verificación).
8. Resultado, comentarios finales y red flags internos.

Acceso al CV y archivos en esta sección. Las verificaciones y notas del Manager siguen guardándose aparte; el registro de Recruitment es solo lectura.

## 4. Pantalla del reclutador
- Formulario editable: mismas secciones con títulos claros, campos más amplios (cajas de texto más altas), letra de 16 px; los empleos se mantienen como tarjetas, con mejor separación y campos agrupados (empresa/puesto/fechas arriba, respuestas largas debajo).
- Evaluación finalizada: usa el mismo componente de lectura del punto 3 (sin duplicar código).

## 5. Formulario del Manager
- Se quita la columna lateral de "Guide times": el tiempo de cada etapa aparece junto a su título ("2. Grammar and English · 5–7 min") y el total en la barra superior. El contenido gana todo el ancho.
- La información de decisión, correo enviado y "Reopen (Admin)" pasa a un bloque al final del cierre.
- Cada etapa: título claro, guía breve y campos amplios.
- Demo Topic justo encima de Teaching Demo Comments. Grammar and English con una sola caja de comentarios.
- Cierre en bloques: Decisión → Training (fecha, modalidad, días y horarios) → Ubicación (sucursal, sucursal de clases, LOB / Zoom) → Trainer.
- Se mantienen las listas de días/horas, el aviso rojo, el resumen y la casilla obligatoria, Save draft y un único Finish interview con un solo correo.

## 6. Verificación visual
- Preparar una entrevista de prueba marcada "TEST — DO NOT PROCESS" con varios empleos y comentarios largos; capturar Recruitment (formulario y finalizada) y Manager (resumen, entrevista completa, cierre) a 1280 px y en una pantalla de portátil (~1366 × 768) al 100 %.
- Revisar: texto legible, respuestas completas, botones visibles, ningún campo cortado. Después, borrar los datos de prueba.

## 7. Permisos y privacidad (sin cambios de acceso)
- El rediseño es solo visual: no se amplían permisos ni se publica ningún expediente.
- Recruitment, Manager y Admin ven las evaluaciones según su rol y países asignados, igual que hoy.
- Un aplicante o un visitante sin sesión no puede ver entrevistas internas, comentarios, red flags, análisis del CV ni el panel, aunque tenga el enlace directo; solo conserva su propio flujo y documentos.
- Se verificará en tres niveles: pantalla (redirección al iniciar sesión / acceso denegado), servidor (cada consulta exige sesión de personal activo, rol y país) y base de datos (reglas de acceso que bloquean a no-personal). Si alguna comprobación falla, se corrige en el mismo trabajo.
- Prueba: abrir la URL de una evaluación sin sesión y con una cuenta sin rol de personal, y llamar directamente a las funciones de datos; las tres deben negar el acceso.

## Detalles técnicos
- Nuevo componente compartido `src/components/recruitment/RecruitmentRecordView.tsx` (lectura por secciones, `JobCard`, `ReferenceCard`, `QA` con `whitespace-pre-wrap` y fallback "No registrado"), alimentado por los mismos `sections`, `evaluation_jobs`, `evaluation_verbs` y referencias que ya cargan ambas pantallas; no hay cambios en el servidor ni en la base de datos.
- Nuevo `CandidateHeader` compartido con cuadrícula `grid-cols-[repeat(auto-fit,minmax(180px,1fr))]` y `min-w-0`.
- `second-filter.$applicationId.tsx`: se retira el `<aside>`, la grilla pasa a una sola columna (`max-w-[1200px]`); `Stage` recibe y muestra `time`; los ítems de verificación (`item(...)`) que usa Reconfirmation se conservan sin cambiar sus claves `v:*`.
- `evaluations.$applicationId.tsx`: ajustes de tipografía/espaciado en el formulario por pasos y uso del componente de lectura en la vista finalizada.
- Permisos por rol/país y la exclusión de red flags en correos no se tocan.
