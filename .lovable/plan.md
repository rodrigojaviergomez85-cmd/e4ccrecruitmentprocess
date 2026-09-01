# E4CC Talent — recreación completa del sistema de reclutamiento

Recrear en este proyecto la misma aplicación de English4Kids Talent, con idéntica funcionalidad, textos de preguntas y criterios de evaluación, cambiando únicamente la marca a **E4CC** (logo subido, naranja + azul marino). Interfaz completamente en inglés.

## Qué se construye

**1. Página de bienvenida (`/`)**
Logo E4CC, explicación del proceso en 4 pasos, botón para iniciar la aplicación y enlace discreto de "Recruiter login".

**2. Flujo de aplicación del candidato (`/apply`)**
- Paso 1: formulario de perfil (nombre, email, teléfono, país, ciudad, experiencia docente, si ha enseñado a niños).
- Paso 2: chequeo de cámara y micrófono en el navegador.
- Pasos 3–4: dos grabaciones de video en el navegador con 30 s de preparación, 1–2 minutos de respuesta, máximo 2 intentos por pregunta.
  - Pregunta 1: presentación personal y motivación.
  - Pregunta 2: experiencia previa (variante alterna si el candidato no tiene experiencia).
- Paso 5: envío. Al enviar, se dispara el análisis de IA en segundo plano.

**3. Evaluación automática con IA**
- Transcripción del audio de cada video.
- Evaluación de gramática, pronunciación, fluidez, comprensión e entonación (pesos 40/20/20/10/10).
- Puntaje final calculado de forma determinista en el servidor (la IA nunca decide el número), con topes duros y "gates" por fallos críticos (tiempos pasados, inteligibilidad, comprensión).
- Nivel CEFR con semáforo: rojo (bajo el nivel preferido), amarillo (revisión humana), verde (fuerte / muy fuerte).

**4. Acceso de reclutadores (`/auth`, `/reset-password`)**
Login por email + contraseña, recuperación de contraseña, y roles separados (admin / recruiter) en tabla propia.

**5. Dashboard de reclutadores (`/dashboard`)**
Listado de candidatos con filtros por estado, país y nivel; indicadores de puntaje y CEFR.

**6. Ficha de candidato (`/candidates/:id`)**
Datos del perfil, reproducción de los dos videos, transcripciones, desglose de puntajes por dimensión, fortalezas, áreas a revisar, evidencia gramatical, y cambio de estado (New, Reviewing, English Approved, Interview, Rejected, Hired).

## Marca E4CC

- Logo subido como asset del proyecto, usado en la cabecera de todas las pantallas y en el favicon.
- Paleta: naranja E4CC como color primario, azul marino profundo como color de texto/superficies oscuras, definida como tokens semánticos en `src/styles.css`.
- Tipografía y componentes shadcn ajustados a esa paleta, en modo claro y oscuro.
- Metadatos SEO propios por ruta ("Join E4CC — Agent Application", etc.).

## Detalles técnicos

- Se activa **Lovable Cloud** (base de datos, autenticación, almacenamiento y IA).
- Migración SQL con: enum `app_role`, tablas `user_roles`, `applications`, `videos`, `transcripts`, `ai_evaluations`, trigger `updated_at`, GRANTs explícitos y RLS con funciones `private.is_staff` / `private.has_role` (SECURITY DEFINER, sin acceso anónimo).
- Bucket privado `candidate-media` para video/audio; lectura solo para staff, subida vía token de envío del candidato.
- Server functions de TanStack Start (`candidate.functions.ts`, `recruiter.functions.ts`) más helpers server-only (`ai.server.ts`); los candidatos no requieren sesión y se identifican por `submit_token`.
- IA vía Lovable AI Gateway: transcripción con `openai/gpt-4o-transcribe` y evaluación con `google/gemini-3.1-pro-preview`, con manejo de errores 402/429 y estado `pending/failed` visible en el dashboard.
- Grabación con `MediaRecorder`, extracción de audio y validación de duración antes de subir.

## Fuera de alcance

- No se copian datos, candidatos ni cuentas del proyecto original: la base arranca vacía.
- Tras el despliegue habrá que crear la primera cuenta de reclutador y asignarle el rol admin.
