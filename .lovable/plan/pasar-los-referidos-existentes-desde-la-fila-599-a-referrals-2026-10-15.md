# Pasar los referidos existentes (desde la fila 599) a Referrals

## Por qué no ves nada todavía
La página Referrals está vacía porque **ningún referido se ha importado**: la conexión con Google Sheets no se pudo autorizar (tu cuenta no tiene permiso para agregar conexiones en este espacio) y todavía no tengo el archivo de la hoja.

## Qué se hará
1. **Tú subes aquí la hoja en Excel** (en Google Sheets: Archivo > Descargar > Microsoft Excel). Es lo único que falta de tu parte.
2. **Reviso las columnas** de la hoja: nombre, teléfono, LOB, sucursal y comentarios del colaborador y del referido.
3. **Importo solo desde la fila 599**:
   - Cada fila guarda su número de fila para que nunca se duplique, aunque se importe otra vez.
   - Si el colaborador ya existe (mismo correo, o mismo nombre y teléfono), se reutiliza.
   - Las filas con errores (#REF!, fechas raras, sin nombre) no se importan y se enlistan para que las revises.
   - Si el correo del referido coincide con una candidatura, se conecta solo. Si no, queda como "sin candidato".
   - **No se envía ningún correo** a los colaboradores.
4. **Te doy el resumen**: cuántas filas entraron, cuántas se conectaron con una candidatura y cuáles tuvieron error.

## Si después agregas los correos en la hoja
- Me mandas el archivo actualizado y las mismas filas se completan con su correo, **sin crear duplicados**.
- Solo se rellenan los correos que estén vacíos. Nunca se reemplaza un correo que ya validaste.
- Con el correo del referido, la persona se conecta sola con su candidatura.
- El correo del colaborador queda "sin validar" hasta que lo confirmes en Referrals. Después de confirmarlo, el colaborador ya puede entrar a Mis referidos.

## Después (opcional): importación automática
Cuando Rodrigo o un administrador conecte Google Sheets en este proyecto, agrego el botón **Importar desde Google Sheets** en Referrals, con vista previa antes de importar, para traer las respuestas nuevas del formulario cuando quieras.

## Detalles técnicos
- La importación usa `source='sheet'`, `source_sheet` = id de la hoja y `source_row` = número de fila; el índice único existente (`referrals_source_row_key`) evita duplicados.
- Las columnas se mapean por encabezado (fila 1), no por posición.
- Se reutilizan las funciones del servidor ya creadas (`createReferral` / inserción directa con el cliente de servicio), sin enviar correos de confirmación en la importación masiva.
