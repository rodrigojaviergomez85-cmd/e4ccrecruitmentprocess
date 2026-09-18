# Simplificar la entrevista y permitir finalización anticipada

## Cambios en el formulario

1. **Unir Grammar Test con English and Grammar Evaluation**
   - Eliminar “Grammar Test” como paso independiente de la navegación.
   - Mostrarlo al inicio de “English and Grammar Evaluation”.
   - Dejar únicamente:
     - **Completed:** Yes / No
     - **Score**
   - Quitar “Verified by evaluator”, las notas internas y el texto explicativo de verificación.
   - Conservar los datos existentes sin borrar registros anteriores.

2. **Quitar los cuadros gramaticales indicados**
   - Eliminar de la pantalla: Simple and progressive tenses, Perfect tenses, Modals, Conditionals, Comparatives y Phrasal verbs.
   - Conservar la pregunta en pasado, Grammar tenses, Mistakes and WH questions, verbos irregulares, roleplay, escritura y nivel final.

3. **Agregar “Finalizar entrevista” en cada paso**
   - Mostrar el botón en todos los módulos mientras la entrevista sea editable.
   - Abrir una ventana de confirmación para elegir **Approved for last step**, **Retake required** o **Not approved**.
   - Mostrar y exigir solamente los campos correspondientes al resultado elegido.
   - Permitir finalizar anticipadamente sin completar las secciones posteriores; guardar todo lo avanzado, actualizar el estado del candidato y dejar la entrevista bloqueada.
   - Mantener la reapertura exclusiva para administradores y registrar la finalización en la auditoría.

4. **Disponibilidad en “No”**
   - Tratar “No” como una respuesta válida, no como un campo incompleto.
   - Permitir continuar al siguiente paso normalmente.
   - El entrevistador podrá usar “Finalizar entrevista” para registrar la decisión en ese mismo momento.

## Validación

- Comprobar que la navegación ya no muestra un módulo separado de Grammar Test.
- Comprobar que Completed acepta Yes/No y Score se guarda con el resto de la evaluación.
- Comprobar que los seis cuadros señalados desaparecieron.
- Probar finalización anticipada desde una sección inicial para los tres resultados y confirmar el cambio del estado del candidato.
- Probar que Availability = No permite avanzar.
- Confirmar autoguardado, bloqueo posterior, reapertura administrativa, permisos y auditoría.
- Verificar la presentación en computadora y teléfono, y confirmar que la aplicación queda sin errores.

## Alcance técnico

- Se reutilizan el registro de evaluación, los resultados finales y la auditoría existentes; no se necesita una tabla nueva.
- La validación distinguirá entre envío completo normal y finalización anticipada, manteniendo las reglas específicas de cada resultado.
- No se modifican el portal del aplicante, la agenda, las grabaciones, la autenticación ni el Scorecard.
