# Gestión de candidatos, retakes y ajustes de la entrevista

## Objetivo

Ampliar el módulo interno para que Admin, Recruiter y Evaluator puedan archivar candidatos, crear retakes conservando historial, agregar personas manualmente y ver un perfil ordenado desde el que se inicia la entrevista. Además, simplificar el formulario de entrevista según lo revisado.

## 1. Archivo seguro de candidatos

- Registrar estado de archivo, fecha, responsable y motivo opcional.
- Botón **Archive candidate** con confirmación, y **Restore candidate** para revertir.
- Ocultar archivados de las listas normales y añadir filtro **Archived**.
- Conservar videos, currículum, referencias, citas, evaluaciones e historial.
- Registrar cada archivo y restauración en el historial interno.
- Admin, Recruiter y Evaluator pueden hacerlo; Viewer solo lectura; se respeta el alcance por país.

## 2. Retake Interview como nuevo intento

- Pasar de una sola evaluación por candidato a un historial de intentos numerados.
- Botón **Create retake interview** cuando ya existe una evaluación.
- Confirmación con fecha prevista y nota del retake.
- El intento anterior queda intacto y en solo lectura; el nuevo empieza limpio.
- Listas, citas, Scorecard y **Start / Continue / View interview** siempre apuntan al intento actual.
- Sección **Interview history** en el perfil con intento, fecha, estado, resultado y acceso de lectura.

## 3. Alta manual de candidatos

- Botón **Add candidate** en las pantallas internas.
- Formulario breve: nombre, correo, teléfono internacional válido, país, ciudad (incluida **Other city**) y modalidad Online u Onsite.
- Marcar el origen como **Added manually** y guardar quién lo creó.
- Aviso de posible duplicado por correo o teléfono antes de guardar.
- Queda listo para entrevista sin exigir videos ni análisis automático.

## 4. Perfil interno organizado

Bloques claros, sin perder información:

1. Datos personales y de contacto
2. Estado de la aplicación y del proceso
3. Experiencia y referencias laborales
4. Currículum, equipo y Grammar Test
5. Evaluación de inglés, videos y transcripciones
6. Citas y enlace de reunión
7. Historial de entrevistas y resultados
8. Historial de actividad

Arriba se muestran las acciones según el estado: Start / Continue / View interview, Create retake interview y Archive / Restore candidate. Los perfiles manuales muestran mensajes de "sin información" donde corresponda, sin bloquear la entrevista.

## 5. Ajustes al formulario de entrevista

- Dejar **una sola** pregunta de metas: se unifica "Career goals for the next two to five years" con "How does teaching fit into those goals".
- Eliminar "What attracted them to this role".
- Eliminar "Strengths" y "Concerns".
- Eliminar por completo el campo de nivel final de inglés en vivo y su nota comparativa.
- Eliminar las siete casillas de puntaje manual del resultado final; el evaluador solo elige el resultado.
- **Class roleplay** pasa a un solo cuadro de observaciones en lugar de cuatro campos separados.
- No se puede avanzar al siguiente módulo sin completar lo obligatorio de ese módulo; el botón de avanzar indica lo que falta. La finalización anticipada sigue disponible.
- Si el aplicante ya subió prueba de velocidad y datos del equipo, esos campos se llenan automáticamente y quedan editables.

## 6. Datos, permisos y seguridad

- Migración aditiva para archivo, origen manual y número de intento.
- Sustituir la restricción de una evaluación por candidato por una única por candidato e intento.
- Los intentos anteriores quedan inmutables; solo el actual es editable.
- Toda creación, archivo, restauración y retake se valida en el servidor y queda en auditoría.
- Sin cambios al formulario público, grabaciones, autenticación ni al flujo de Calendly.

## 7. Verificación

- Archivar, filtrar y restaurar sin pérdida de datos.
- Crear varios intentos y confirmar que cada evaluación conserva sus datos.
- Comprobar que Start / Continue / View abre el intento correcto.
- Agregar candidatos manuales Online y Onsite, con aviso de duplicados.
- Iniciar entrevista desde un perfil manual sin videos.
- Confirmar que no se avanza con campos obligatorios vacíos y que el equipo se autocompleta.
- Revisar que las preguntas y campos eliminados ya no aparecen y que el roleplay es un solo cuadro.
- Revisar en escritorio y móvil, y verificar que no haya errores en pantalla.
