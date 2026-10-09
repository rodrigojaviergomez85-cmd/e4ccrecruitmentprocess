# Menú compartido para las pantallas internas

## Objetivo
Unificar la navegación de `/dashboard`, `/evaluations` y el resto de las pantallas internas de reclutamiento, conservando el diseño nuevo de Evaluations, los accesos actuales y las reglas de permisos.

## Cambios
- Crear un encabezado compartido con el logo de E4CC y un único orden de opciones: **Candidates**, **Add candidate**, **Pending Second Filter**, **E4CC Interviews**, **Scorecard**, **Training Tracker**, y, solo para Admin, **Settings** y **Staff**; incluir **Sign out**.
- Mantener **Archived** como control propio del Dashboard, porque cambia esa lista y no navega a otra pantalla.
- Resaltar automáticamente la opción activa según la ruta, incluyendo páginas de detalle dentro de Candidates, Evaluations y Second Filter.
- Montar el encabezado en la estructura autenticada para que permanezca al navegar, al recargar y al entrar directamente a una URL interna.
- En celular, mostrar el logo y un botón de menú que abra las mismas opciones en formato desplegable, con etiquetas legibles y la sección activa identificada.
- Aplicar los permisos actuales al menú: ocultar Evaluations y Scorecard sin permiso para evaluar; mostrar Settings y Staff solo a Admin; limitar las cuentas Trainer/Generalista a Training Tracker y Sign out.
- Retirar de cada pantalla interna los encabezados repetidos con logo o enlaces de regreso, conservando como barras locales únicamente las acciones propias de la pantalla, por ejemplo el reloj, estado, guardar, exportar o cerrar una entrevista.
- No montar este menú en `/auth`, formularios públicos, enlaces de candidatos, reagendamiento, retakes ni otras páginas públicas.

## Cobertura
- Usar el encabezado compartido en Dashboard, Evaluations, detalle de evaluación, Scorecard, Pending Second Filter y su detalle, candidatos y alta manual, Interviews, Training Tracker, Settings y Staff.
- Conservar sin cambios la tabla, pestañas, filtros, No Show/Waiting List, paginación y demás funciones del diseño nuevo de Evaluations.

## Verificación
- Probar con sesión válida: entrada directa y recarga en `/dashboard`, navegación Dashboard → Evaluations → Dashboard, y retorno desde una evaluación.
- Probar el acceso posterior al inicio de sesión, tanto con contraseña como con el retorno de Google, confirmando que llega a Dashboard con el menú visible.
- Verificar escritorio y celular, estado activo, apertura/cierre del desplegable y cierre de sesión.
- Comprobar perfiles Admin, Recruitment/Manager y Trainer/Generalista para confirmar que cada uno solo ve sus opciones permitidas.
- Confirmar que `/auth` y las páginas públicas de candidatos no muestran navegación interna y que no quedan encabezados duplicados.

## Detalles técnicos
- El encabezado se integrará dentro de la ruta autenticada existente, después de validar la sesión y el perfil del personal; las páginas públicas quedan fuera de esa estructura.
- Se reutilizará el contexto de acceso que ya carga la protección interna, evitando una segunda consulta y manteniendo las restricciones del servidor sin cambios.
