# Corregir la sucursal de Training en el convenio

## Resultado
- La **Sucursal de Training** será escrita y confirmada por el Manager.
- La ciudad del candidato ya no se colocará automáticamente en ese campo.
- El campo mostrará un ejemplo claro para evitar confundirlo con la dirección.

## Cambio técnico
- Quitar `app.city` como valor inicial de `training:branch`.
- Mantener separados `Training branch` y `Training address`; el PDF seguirá tomando exclusivamente `training:branch` para “Sucursal de Training”.
- Verificar que el formulario y la generación del convenio usen el dato guardado por el Manager.
