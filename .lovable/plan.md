# Gestión completa de candidatos y retake interviews

## Objetivo

Ampliar el módulo interno existente para que Admin, Recruiter y Evaluator puedan:

- Archivar y restaurar candidatos sin perder información.
- Crear una nueva entrevista de retake conservando todas las evaluaciones anteriores.
- Agregar manualmente a una persona que no haya usado el formulario público.
- Consultar un perfil interno claro, ordenado y completo.
- Iniciar o continuar la entrevista directamente desde ese perfil.

## 1. Archivo seguro de candidatos

- Añadir a cada candidato estado de archivo, fecha, usuario responsable y motivo opcional.
- Incluir **Archive candidate** en el perfil, con confirmación explícita para evitar errores.
- Ocultar los archivados de las listas normales y agregar un filtro **Archived**.
- Permitir **Restore candidate** desde el perfil archivado.
- Conservar videos, currículum, referencias, citas, evaluaciones y auditoría.
- Registrar cada archivo y restauración en el historial interno.
- Aplicar permisos y alcance por país en el servidor para Admin, Recruiter y Evaluator; Viewer seguirá siendo solo lectura.

## 2. Retake Interview como nuevo intento

- Convertir la relación actual de una sola evaluación por candidato en un historial de intentos numerados.
- Mantener intacta la evaluación anterior, sus respuestas, puntaje, resultado, evaluador y auditoría.
- Añadir **Create retake interview** cuando exista una evaluación previa.
- Pedir confirmación y permitir indicar fecha prevista y nota del retake.
- Crear un intento nuevo y limpio, vinculado al mismo candidato y, cuando exista, a la nueva cita.
- Mostrar siempre el intento actual en las listas y en **Start/Continue interview**.
- Mostrar en el perfil una sección **Interview history** con intento, fecha, estado, resultado, puntaje y acceso de solo lectura a cada evaluación anterior.
- Ajustar la cola de entrevistas, las citas y el Scorecard para distinguir el intento actual del historial y evitar resultados duplicados o desordenados.

## 3. Alta manual de candidatos

- Añadir **Add candidate** en las pantallas internas de candidatos y entrevistas.
- Crear un formulario breve con:
  - Nombre completo.
  - Correo.
  - Teléfono internacional válido.
  - País y ciudad dependiente, incluyendo **Other city**.
  - Modalidad Online u Onsite.
- Marcar claramente el origen como **Added manually** y registrar quién creó el perfil.
- Crear el expediente listo para revisión e entrevista, sin exigir videos, análisis automático ni completar el portal público.
- Evitar duplicados mediante advertencia por correo o teléfono antes de guardar.
- Respetar el alcance de países del miembro del equipo que lo agrega.

## 4. Perfil interno organizado

Reordenar el perfil existente en bloques claros, sin quitar información:

1. **Personal and contact information**.
2. **Application and recruitment status**.
3. **Experience and work references**.
4. **Resume, device information and Grammar Test**.
5. **English assessment, videos and transcripts** cuando existan.
6. **Appointments and meeting link**.
7. **Interview history and results**.
8. **Activity history**.

En la parte superior se mostrarán las acciones según el estado:

- **Start interview** si no existe un intento.
- **Continue interview** si el intento actual está abierto.
- **View interview** si está finalizado.
- **Create retake interview** si ya hubo una evaluación.
- **Archive candidate** o **Restore candidate**.

Los candidatos agregados manualmente mostrarán estados vacíos claros donde no existan videos, análisis, currículum o referencias, sin bloquear el inicio de la entrevista.

## 5. Datos, permisos y seguridad

- Migración aditiva para archivo, origen manual y número/estado del intento.
- Sustituir la restricción de una evaluación por candidato por una restricción única por candidato e intento.
- Mantener las evaluaciones anteriores inmutables; solo el intento actual podrá editarse.
- Toda creación, archivo, restauración y retake se validará en el servidor y se guardará en auditoría.
- Admin, Recruiter y Evaluator podrán gestionar estas acciones; Viewer conservará acceso de lectura.
- Se mantendrá el alcance por país para usuarios no administradores.
- No se modificarán el formulario público, las grabaciones existentes, la autenticación ni el flujo actual de Calendly.

## 6. Verificación

- Archivar, filtrar y restaurar un candidato sin pérdida de datos.
- Confirmar que Viewer no puede ejecutar acciones y que el alcance por país sigue aplicado.
- Crear dos o más intentos para un mismo candidato y verificar que cada evaluación conserva sus propios datos.
- Confirmar que Start/Continue/View abre siempre el intento correcto.
- Agregar manualmente candidatos Online y Onsite, incluyendo Other city y validación E.164.
- Comprobar advertencias de duplicados por correo/teléfono.
- Iniciar una entrevista desde un perfil manual sin videos ni análisis previo.
- Revisar el perfil completo en escritorio y móvil.
- Verificar compilación, errores en pantalla y auditoría de todas las acciones.
