# Pasar los referidos existentes (desde la fila 599) a Referrals

## Qué se hará
1. **Conectar Google Sheets** con la cuenta del equipo que tiene la hoja. Te aparecerá una tarjeta para autorizarla.
2. **Leer la hoja** que compartiste y revisar sus columnas: nombre, teléfono, LOB, sucursal y comentarios del colaborador y del referido.
3. **Importar solo desde la fila 599**:
   - Cada fila guarda su número para que nunca se duplique, aunque se importe otra vez.
   - Si el colaborador ya existe (mismo correo, o mismo nombre y teléfono), se reutiliza.
   - Las filas con errores (#REF!, fechas raras, sin nombre) no se importan y se enlistan para que las revises.
   - Si el correo del referido coincide con una candidatura, se conecta solo. Si no, queda como "sin candidato".
   - **No se envía ningún correo** a los colaboradores.
4. **Botón "Importar desde Google Sheets"** en Referrals:
   - Primero muestra una vista previa con las filas nuevas, las filas con error y las ya importadas.
   - Después confirmas la importación. Sirve también para traer las respuestas nuevas del formulario.
5. **Ejecutar la primera importación** y darte el resumen: cuántas filas entraron, cuántas se conectaron con una candidatura y cuáles tuvieron error.

## Qué queda igual
- Las filas antiguas no traen el correo del colaborador. Esos colaboradores aparecen como "sin validar" y no pueden entrar a Mis referidos hasta que valides su correo.

## Detalles técnicos
- Conector Google Sheets; el servidor lee el rango `A599:Z` con `values:batchGet`. El navegador no consulta la hoja.
- Una nueva función del servidor para el personal, `importReferralsFromSheet({ dryRun })`, sigue estas reglas:
  - Usa `source='sheet'`, `source_sheet` = id de la hoja y `source_row` = número de fila. El índice único evita los duplicados.
  - Guarda la fila completa en `raw`.
- Las columnas se mapean por encabezado (fila 1), no por posición.
- Se agregan pruebas para el mapeo de filas, las filas con error y una importación repetida que no debe crear duplicados.
