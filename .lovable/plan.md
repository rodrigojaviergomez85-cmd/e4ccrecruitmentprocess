# Que el login de Google te lleve al panel de reclutador

## Qué está pasando

Al entrar con **Continue with Google**, el inicio de sesión sí funciona, pero Google devuelve el navegador a la raíz del sitio (`/`), que es la página pública del candidato. Como esa página no revisa si hay sesión iniciada, siempre se queda ahí y nunca llegas al panel. Por eso "solo me lleva a la página del evaluado".

## Qué se va a hacer

1. **Página de retorno de Google**: se crea una ruta pública `/auth/callback` que muestra un "Signing you in…" breve, espera a que la sesión quede lista y te envía directo a `/dashboard`. El botón de Google usará esa ruta como destino de retorno en lugar de la raíz.
2. **La raíz reconoce tu sesión**: en la página de inicio, el enlace "Recruiter login" pasa a decir **"Go to dashboard"** cuando ya estás autenticado, de modo que aunque caigas en `/` puedas continuar con un clic.
3. Si Google regresa con un error, se muestra el mensaje y se vuelve a `/auth`.

## Resultado

Entras a `/auth`, tocas Continue with Google y aterrizas en el **Dashboard** con la lista de candidatos y sus resultados de evaluación.

## Detalle técnico

- Nueva ruta `src/routes/auth.callback.tsx` (pública, `ssr: false`): espera `supabase.auth.getSession()` / `onAuthStateChange` y navega a `/dashboard` con `replace: true`; si no hay sesión tras el intento, redirige a `/auth`.
- `src/routes/auth.tsx`: `redirect_uri: ${window.location.origin}/auth/callback` en `lovable.auth.signInWithOAuth`.
- `src/routes/index.tsx`: estado de sesión en `useEffect` para alternar el texto/destino del enlace del encabezado.
- Sin cambios de base de datos ni de permisos; el `StaffGate` sigue validando el rol.
