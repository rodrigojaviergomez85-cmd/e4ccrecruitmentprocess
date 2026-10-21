# Que "Editar / agregar" muestre las referencias que ya existen

## Qué está pasando
La ventana solo carga las referencias que el candidato escribió en su solicitud. Casi siempre las referencias las anota el reclutador durante la entrevista (por ejemplo ROBERTO CARDENAS · Reclutador), y esas no se cargan en la ventana. Por eso parece que solo se puede agregar.

## Qué cambiará
- Al abrir "Editar / agregar" se verán **todas** las referencias que ya aparecen en "Contactos": las del candidato y las del reclutador, cada una con una etiqueta (Aplicante / Reclutador).
- Podrás corregir nombre, empresa, puesto, teléfono y correo de cualquiera de ellas.
- Con "Agregar referencia" podrás seguir añadiendo nuevas (hasta 5 por tipo).
- Al guardar, cada referencia se actualiza donde ya estaba, sin crear duplicados. Lo que veas en "Contactos" y en el expediente será lo que guardaste.
- Solo podrán hacerlo las mismas personas que hoy trabajan las referencias (Recruitment y Admin), y cada cambio queda en el historial.

## Detalles técnicos
- `listTrainingRoster`: devolver las referencias editables con su origen (`work_references` por slot, `evaluation_jobs` por id/slot de la última evaluación), con teléfono y correo por separado para las del candidato y el contacto único para las del reclutador.
- `saveTrainingReferences`: aceptar ambos orígenes. Para las del candidato se usa upsert por `application_id + slot`; para las del reclutador, update por id del `evaluation_jobs`, e insert de nuevas en la última evaluación con el siguiente slot. Se mantienen las mismas validaciones de permiso, país y estado, y la auditoría.
- `ReferencesEditor`: precargar todas, mostrar la etiqueta de origen y que las nuevas se agreguen como "Reclutador".
- Se verificará en pantalla con Susy Arely Melgar Ayala o con un candidato que tenga contactos de reclutador.
