# Dar acceso de owner a tu cuenta de Google personal

Tu inicio de sesión con Google funcionó (cuenta `keniacastillo9@gmail.com`), pero esa cuenta no tiene ningún rol de staff, por eso el panel te rechaza. El acceso automático de owner estaba reservado al correo `kennia.vasquez@e4ccglobal.com`, que aún no ha entrado nunca.

## Qué se va a hacer

1. Asignar el rol **Admin (owner)** a la cuenta que ya creaste con Google: `keniacastillo9@gmail.com`.
2. Crear su perfil de staff activo (nombre "Kenia Castillo"), sin obligación de cambiar contraseña, ya que entra con Google.
3. Mantener también el acceso automático de owner para `kennia.vasquez@e4ccglobal.com` por si más adelante entras con el correo corporativo.

## Resultado

- Recargas `/auth`, entras con **Continue with Google** usando tu Gmail y llegas al **Dashboard**.
- Desde **Staff** podrás crear las cuentas del resto del equipo (Admin / Recruiter / Viewer) con contraseña temporal.

## Detalle técnico

- Una migración inserta la fila de rol `admin` para el `user_id` existente `37c352c0-a8c0-4549-b9f5-5642dcf00325` y su fila en `staff_profiles` (activo, sin cambio de contraseña forzado).
- No se modifica ningún archivo de la aplicación; el disparador de bootstrap por correo corporativo queda igual.
- Verificación: consulta de rol y perfil tras la migración.
