# Arreglar la prueba de internet (resultados muy bajos)

## Problema
La prueba real marca 433 Mbps de bajada / 107 de subida / 4 ms, y la página marca 13.9 / 16.7 / 68 ms. La prueba actual descarga archivos pequeños (2 MB) desde nuestro propio servidor, que está lejos del candidato. Por eso casi todo el tiempo medido es espera y no velocidad, y el resultado sale mucho más bajo que el real.

## Solución
Medir contra la red pública de pruebas de velocidad de Cloudflare (la misma infraestructura que usa speed.cloudflare.com). Tiene servidores cerca de cada país (incluido Centroamérica), y así los resultados quedan cerca de los de Speedtest/Fast.

- **Ping**: varias peticiones mínimas y se usa la mediana (no el promedio).
- **Bajada**: 6 conexiones en paralelo con archivos cada vez más grandes (hasta ~25 MB) durante unos 8 segundos. Se cuentan los bytes a medida que llegan, y se ignora el primer segundo de arranque.
- **Subida**: 4 conexiones en paralelo con bloques de 5–10 MB durante unos 6 segundos.
- Se muestra el avance en vivo ("Testing download… 180 Mbps") en lugar de solo un círculo girando.
- Si Cloudflare no responde, se usa la prueba actual de respaldo para que el candidato no quede bloqueado.
- Se mantiene: mínimo de 10 Mbps, "Test again" que conserva el mejor resultado, opción "Change to Onsite" y excepción del reclutador.

## Detalles técnicos
- Solo cambia la función `speedTest` en `src/routes/process.$id.tsx`: `GET https://speed.cloudflare.com/__down?bytes=N` y `POST https://speed.cloudflare.com/__up` (permiten llamadas desde el navegador), leyendo el cuerpo con `ReadableStream` para medir el caudal real.
- `/api/public/speed-test` queda como respaldo.
- No se tocan el guardado de resultados, la validación del servidor ni otros módulos.
- Verificación: correr la prueba en el navegador y confirmar que los números son razonables y se guardan.
