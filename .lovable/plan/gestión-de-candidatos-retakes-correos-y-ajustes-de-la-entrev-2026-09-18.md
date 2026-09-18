# Gestión de candidatos, retakes, correos y ajustes de la entrevista

## Objetivo

Ampliar el módulo interno para archivar candidatos, crear retakes con historial, agregar personas manualmente, ver un perfil ordenado desde el que se inicia la entrevista, enviar correos de seguimiento con reagendamiento y simplificar el formulario de entrevista.

## 1. Archivo seguro de candidatos

- Registrar estado de archivo, fecha, responsable y motivo opcional.
- Botón **Archive candidate** con confirmación y **Restore candidate** para revertir.
- Ocultar archivados de las listas normales y añadir filtro **Archived**.
- Conservar videos, currículum, referencias, citas, evaluaciones e historial.
- Admin, Recruiter y Evaluator pueden hacerlo; Viewer solo lectura; se respeta el alcance por país.

## 2. Retake Interview como nuevo intento

- Pasar de una sola evaluación por candidato a un historial de intentos numerados.
- Botón **Create retake interview** cuando ya existe una evaluación.
- El intento anterior queda intacto y en solo lectura; el nuevo empieza limpio.
- **El retake inicia directamente en Grammar Check / English evaluation.** Datos personales, estudios, experiencia, referencias y valores se arrastran del intento anterior y quedan editables.
- Si la persona cambia de modalidad (Online u Onsite), el evaluador puede cambiarla y entonces se habilitan de nuevo los pasos que dependen de ella, como el equipo.
- Listas, citas, Scorecard y **Start / Continue / View interview** apuntan siempre al intento actual.
- Sección **Interview history** en el perfil con intento, fecha, estado, resultado y acceso de lectura.

## 3. Correos de seguimiento y reagendamiento

- Al guardar un resultado **Retake required** o **Not approved**, se prepara automáticamente el correo al candidato.
- Se usa la plantilla de correo que el equipo ya tiene; solo cambian el nombre del candidato y el área de oportunidad detectada en la entrevista.
- **Retake**: el correo incluye el enlace para agendar la nueva entrevista, y también se puede agendar directamente desde la ficha del candidato usando la agenda ya conectada.
- **Not approved**: correo de cierre, sin enlaces para agendar.
- Los correos salen desde el sistema con el dominio de la empresa y quedan registrados en el historial del candidato, con estado enviado o fallido.
- Pendiente de su parte: enviarme el texto exacto de la plantilla actual para Retake y para Not approved.

## 4. Alta manual de candidatos

- Botón **Add candidate** en las pantallas internas.
- Formulario breve: nombre, correo, teléfono internacional válido, país, ciudad (incluida **Other city**) y modalidad Online u Onsite.
- Marcar el origen como **Added manually** y guardar quién lo creó.
- Aviso de posible duplicado por correo o teléfono antes de guardar.
- Queda listo para entrevista sin exigir videos ni análisis automático.

## 5. Perfil interno organizado

Bloques claros, sin perder información:

1. Datos personales y de contacto
2. Estado de la aplicación y del proceso
3. Experiencia y referencias laborales
4. Currículum, equipo y Grammar Test
5. Evaluación de inglés, videos y transcripciones
6. Citas, enlace de reunión y reagendamiento
7. Historial de entrevistas, resultados y correos enviados
8. Historial de actividad

Arriba se muestran las acciones según el estado: Start / Continue / View interview, Create retake interview, Schedule o Reschedule, y Archive / Restore candidate. Los perfiles manuales muestran mensajes de "sin información" donde corresponda, sin bloquear la entrevista.

## 6. Ajustes al formulario de entrevista

- Dejar **una sola** pregunta de metas, uniendo "Career goals for the next two to five years" con "How does teaching fit into those goals".
- Eliminar "What attracted them to this role".
- Eliminar "Strengths" y "Concerns".
- Eliminar el campo de nivel final de inglés en vivo y su nota comparativa.
- Eliminar las siete casillas de puntaje manual del resultado final; el evaluador solo elige el resultado.
- **Class roleplay** pasa a un solo cuadro de observaciones en lugar de cuatro campos.
- No se puede avanzar al siguiente módulo sin completar lo obligatorio; el botón indica qué falta. La finalización anticipada sigue disponible.
- Si el aplicante ya subió prueba de velocidad y datos del equipo, esos campos se llenan automáticamente y quedan editables.

## 7. Datos, permisos y seguridad

- Migración aditiva para archivo, origen manual, número de intento y registro de correos.
- Sustituir la restricción de una evaluación por candidato por una única por candidato e intento.
- Los intentos anteriores quedan inmutables; solo el actual es editable.
- Toda creación, archivo, restauración, retake y envío de correo se valida en el servidor y queda en auditoría.
- Sin cambios al formulario público, grabaciones ni autenticación.

## 8. Verificación

- Archivar, filtrar y restaurar sin pérdida de datos.
- Crear varios intentos y confirmar que cada evaluación conserva sus datos.
- Comprobar que el retake abre en Grammar Check con la información anterior cargada y permite cambiar de modalidad.
- Confirmar que Retake y Not approved generan el correo correcto, con y sin enlace de agenda, y que queda registrado.
- Agendar y reagendar desde la ficha del candidato.
- Agregar candidatos manuales Online y Onsite, con aviso de duplicados.
- Confirmar que no se avanza con campos obligatorios vacíos y que el equipo se autocompleta.
- Revisar que los campos eliminados ya no aparecen y que el roleplay es un solo cuadro.
- Revisar en escritorio y móvil, y verificar que no haya errores en pantalla.
