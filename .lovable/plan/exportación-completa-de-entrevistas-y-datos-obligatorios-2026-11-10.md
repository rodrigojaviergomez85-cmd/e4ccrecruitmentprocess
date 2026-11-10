# Exportación completa de entrevistas y datos obligatorios

## Lo que encontré
- Hoy hay 458 entrevistas guardadas; 96 no tienen país (no 89). De esas 96, solo 4 tienen teléfono en la aplicación, así que el relleno automático por código de país cubrirá pocas; el resto quedará marcado "incompleta".
- Las sucursales de la plataforma no coinciden del todo con tu lista: faltan **Salvador del Mundo** (SV), **Zona 13** y **Portales Mall** (GT). En SV se llaman "Plaza Merliot" y "Plaza Lourdes"; las dejaré como "Merliot" y "Lourdes" según tu lista, sin romper los registros existentes.

## 1. Pantalla "Exportar entrevistas"
- Nueva página en el menú interno (Admin, Recruitment y Managers).
- Filtros: desde / hasta (fecha de entrevista), país y modalidad opcionales. Sin filtros descarga todo.
- CSV UTF-8 con BOM, separado por comas, una fila por evaluación, con las 16 columnas en el orden y encabezados exactos del documento.
- Formatos: fecha `AAAA-MM-DD`, `submitted_at` ISO con zona, correo en minúsculas, teléfono solo dígitos, modalidad `ONLINE`/`PRESENCIAL`, sucursal vacía si es Online, `es_prueba` TRUE/FALSE. Nunca `#N/A`, `-`: celdas vacías si falta dato opcional.
- Resultado mapeado a: Approved for last step, Not approved, Retake required, Pending.

## 2. Datos obligatorios al cerrar la entrevista
- En la evaluación de primer filtro: País, Modalidad y Sucursal (si es Presencial) como listas desplegables, con sucursales según país.
- Se guardan en la ficha del candidato. No se puede finalizar sin ellos (validado también en el servidor).
- Las entrevistas existentes sin estos datos muestran una etiqueta "Incompleta" en Interviews y en la evaluación.

## 3. Relleno de país faltante
- Una sola vez: deducir país desde el teléfono (502 GT, 503 SV, 504 HN, 505 NI, 52 MX, 57 CO). Lo que no se pueda deducir queda vacío y marcado "Incompleta". Nada inventado.

## 4. Registros de prueba
- Nuevo campo "Es prueba" (apagado por defecto) y botón para marcar/desmarcar en la evaluación.
- Marcado inicial automático: correos del dominio de la empresa y los correos personales del equipo de reclutamiento. El export los incluye con TRUE, no se borran.

## Pregunta pendiente
- Necesito la lista de **correos personales del equipo** para marcarlos como prueba (los del dominio de la empresa los detecto solo).

## Detalles técnicos
- Migración: `is_test boolean default false` en `interview_evaluations`; reutilizar `country_code`, `work_modality`, `branch` y `source` de `applications`; actualizar `ONSITE_BRANCHES` en `src/lib/branches.ts`.
- Server function con scope de país y paginación para armar las filas; CSV generado en el navegador (Blob) con helper de descarga.
- Lógica pura de mapeo (resultado, teléfono→país, formato de celdas) en `src/lib/interview-export.ts` con pruebas.
- Relleno de país vía migración de datos con auditoría.
