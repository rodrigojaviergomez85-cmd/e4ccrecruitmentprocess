# Corregir el tiempo irreal de entrevistas (AHT)

## Qué pasó
- El máximo de 169:03:06 es la entrevista de **Cristhel Junieth Mejía Rosales**. Se abrió el 21 de octubre y se cerró hoy, 28 de octubre. El reloj nunca se pausó durante esos 7 días: 608,586 segundos.
- Hay otras dos entrevistas con tiempos imposibles por la misma causa:
  - **Valentin Coronado:** 26 h.
  - **Rudyard Francisco Aguirre:** 18 h.
- El reloj arranca solo al abrir la ficha y queda a nombre de quien la creó, aunque sea otra persona la que entreviste. Además, la pausa solo funciona si el navegador logra avisar al salir. Si se cierra la pestaña o se apaga la computadora, el tiempo sigue sumando.

## Cambios
1. **Tope de seguridad:** cada tramo del reloj suma como máximo 90 minutos. Un tramo es desde que se abre o reanuda la ficha hasta que se pausa o se cierra. Si alguien deja la ficha abierta o pierde la conexión, no se cuentan días.
2. **Señal de actividad:** mientras la ficha está visible, la página avisa cada minuto que sigue abierta. Si pasan más de 3 minutos sin aviso, el tiempo se corta en el último aviso recibido. Así cerrar la pestaña ya no deja el reloj corriendo.
3. **Crédito correcto:** el tiempo se suma a la persona que tenía la entrevista abierta, no a quien creó la ficha. Si otra persona la abre, su tiempo cuenta para ella.
4. **Corregir los datos actuales:** las 3 entrevistas con más de 3 horas quedan sin tiempo y no cuentan en el AHT. Se guarda un registro en el historial. Así no se inventa un número.
5. **Reporte de AHT:** el reporte deja fuera cualquier tiempo mayor de 3 horas, por si queda alguno viejo.
6. Se agrega una prueba que confirma el tope de 90 minutos y la exclusión de tiempos mayores de 3 horas.

## Detalles técnicos
- `aht.server.ts` y `aht.functions.ts`: limitar cada tramo a 90 minutos. Agregar `heartbeatInterviewTimer`, que guarda la hora del último aviso. Al pausar o cerrar, el tiempo se calcula hasta el último aviso.
- Agregar una columna `timer_last_seen_at` y otra `timer_owner_id`, que guarda quién tenía la ficha abierta. Ambas van en las tablas de entrevistas de Recruitment y de Manager.
- `getAhtReport` y la parte de AHT del scorecard agrupan por `timer_owner_id`, usan los registros anteriores como respaldo y descartan tiempos mayores de 10,800 segundos.
- Las entrevistas en `/evaluations/$id` y `/second-filter/$id` envían el aviso cada 60 segundos mientras la ficha está visible.
- Una migración pone en nulo `handle_seconds` cuando es mayor de 10,800 y guarda la corrección en `audit_logs`.
