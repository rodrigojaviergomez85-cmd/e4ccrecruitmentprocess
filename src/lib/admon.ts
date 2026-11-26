/** ADMON (administrative/sales) hiring: form definitions shared by UI and server. */
export const ADMON_POSITIONS = [
  "AGENTE DE VENTAS", "GERENTE DE VENTAS", "COORDINADOR ACADEMICO", "RESPONSABLE DE IT", "AUDIOVISUAL",
  "AUXILIAR DE COMPRAS", "AUXILIAR CONTABLE", "MANTENIMIENTO", "TECNICO EN LIMPIEZA", "ASISTENTE ADMINISTRATIVO",
] as const;
export const ADMON_COUNTRIES = ["EL SALVADOR", "NICARAGUA", "GUATEMALA", "ONLINE"] as const;
export const ADMON_BRANCHES = [
  "E4CC LAS AMERICAS", "E4CC LAS BRISAS", "E4CC METROCENTRO NICARAGUA", "E4CC MASAYA", "E4CC ZONA 13", "E4CC METRONORTE",
  "E4CC SAN JOSE PINULA", "E4CC GALERIAS PRIMMA", "E4CC METROCENTRO VILLANUEVA", "E4CC PLAZA MUNDO", "E4CC SAN MARCOS",
  "E4CC METROSUR", "E4CC SALVADOR DEL MUNDO", "E4CC MERLIOT", "E4CC LOURDES", "E4CC SANTA ANA", "TODAS SV", "TODAS GT",
  "TODAS NIC", "POSICIÓN REGIONAL",
] as const;
export const ADMON_EVALUATORS = ["HELLEN GARCIA", "KENNIA VASQUEZ", "MORENA LEMUS"] as const;

export const isSalesPosition = (p: string) => p === "AGENTE DE VENTAS" || p === "GERENTE DE VENTAS";

export type AdmonStage = "screening" | "operations" | "technical" | "hired" | "rejected";
export const STAGE_LABELS: Record<AdmonStage, string> = {
  screening: "1. Screening",
  operations: "2. Gerente de Operaciones",
  technical: "3. Entrevista técnica",
  hired: "Contratado",
  rejected: "No continúa",
};

export const REFERENCE_CALL_RESULTS = ["Pendiente", "Positiva", "Negativa", "No contestó", "Número incorrecto"] as const;
export type ReferenceCall = { result: string; comment: string; by?: string | null; at?: string | null };

/** Result filters: each later approval implies the earlier ones. */
export type AdmonResultFilter = "interviewed" | "passed_screening" | "passed_operations" | "approved_training";
export function matchesResult(c: { screening_decision: string | null; operations_decision: string | null; technical_decision: string | null }, f: AdmonResultFilter) {
  if (f === "interviewed") return c.screening_decision != null;
  if (f === "passed_screening") return c.screening_decision === "Pasa";
  if (f === "passed_operations") return c.operations_decision === "Pasa";
  return c.technical_decision === "Pasa";
}

/** Next stage after a "pasa" decision; any "no pasa" ends the process. */
export function nextStage(stage: "screening" | "operations" | "technical", passes: boolean): AdmonStage {
  if (!passes) return "rejected";
  return stage === "screening" ? "operations" : stage === "operations" ? "technical" : "hired";
}

export type Field = { key: string; label: string; hint?: string; type: "text" | "long" | "yesno" | "score" | "done" };
export type Section = { title: string; intro?: string; fields: Field[]; salesOnly?: boolean };

export const SCREENING_SECTIONS: Section[] = [
  {
    title: "HDHI — posiciones de venta", salesOnly: true,
    intro: "“Estoy buscando a una superestrella. ¿Por qué deberíamos proceder a la entrevista?” Espera respuesta… “No percibo ese perfil de superestrella.” Si insiste, seguimos adelante.",
    fields: [
      { key: "hdhi_pass", label: "¿Perfil pasa?", type: "yesno" },
      { key: "hdhi_notes", label: "Comentarios sobre la respuesta HDHI", type: "long" },
      { key: "roleplay", label: "Roleplay de ventas", type: "long" },
      { key: "roleplay_pass", label: "¿Pasa el roleplay?", type: "yesno" },
    ],
  },
  {
    title: "Screening",
    fields: [
      { key: "goals", label: "¿Cuáles son tus metas/objetivos profesionales?", hint: "Lo que espera lograr a corto, mediano o largo plazo.", type: "long" },
      { key: "good_at", label: "¿En qué eres realmente bueno(a) profesionalmente?", type: "long" },
      { key: "not_good_at", label: "¿En qué no eres bueno(a) o qué no te interesa hacer profesionalmente?", type: "long" },
      { key: "screening_pass", label: "¿Pasa?", type: "yesno" },
    ],
  },
];
export const REFERENCE_FIELDS: Field[] = [
  { key: "company", label: "Empresa y tiempo trabajado", type: "text" },
  { key: "boss", label: "Nombre y contacto del jefe", type: "text" },
  { key: "score", label: "Nota del 1 al 10 del ex jefe", type: "score" },
  { key: "notes", label: "Observaciones", hint: "Razón de la nota · razón de salida · preguntas de validación", type: "long" },
];
export const SCREENING_CLOSE: Field[] = [
  { key: "comments", label: "Comentarios", type: "long" },
  { key: "flags", label: "Fortalezas, áreas de mejora y posibles red flags para el Gerente", type: "long" },
];

export const OPERATIONS_SECTIONS: Section[] = [
  {
    title: "Bienvenida",
    intro: "Preséntate y confirma la plaza. Comparte salario base + bono por métricas. Pregunta si revisó el perfil de la plaza. Explica que dura 45–60 min en tres partes (historia personal, experiencia profesional, conexión entre ambas) y pide permiso para preguntas personales.",
    fields: [{ key: "welcome_done", label: "Bienvenida realizada", type: "done" }],
  },
  {
    title: "Parte 2 — Relax (preguntas personales)",
    fields: [
      { key: "childhood", label: "¿Cómo fue tu niñez y cómo era la relación con tu padre y madre?", type: "long" },
      { key: "events", label: "¿Qué eventos te marcaron y formaron la persona que ahora eres?", type: "long" },
      { key: "proud", label: "Dime 3–4 cosas de las que estés más orgulloso en tu vida.", type: "long" },
      { key: "against", label: "Una ocasión cuando todo estaba en tu contra. ¿Qué hiciste y cómo saliste exitoso?", type: "long" },
      { key: "mastery", label: "¿Alcanzaste maestría en algo (deportes, música, hobbies…)?", type: "long" },
      { key: "friends", label: "¿Cómo te describirían tus amigos?", type: "long" },
      { key: "learning", label: "¿Último libro, curso o seminario que tomaste?", type: "long" },
      { key: "sport", label: "¿Practicas algún deporte o ejercicio? ¿Con qué frecuencia?", type: "long" },
      { key: "personal_pass", label: "¿Pasa?", type: "yesno" },
    ],
  },
];
/** Chronological walkthrough: the form repeated these per job; here they appear once per job. */
export const JOB_FIELDS: Field[] = [
  { key: "place", label: "Lugar de trabajo", type: "text" },
  { key: "dates", label: "Fechas + tiempo", type: "text" },
  { key: "hired_for", label: "¿Para qué te contrataron?", hint: "Metas y métricas · ¿cómo sabías si eras exitoso?", type: "long" },
  { key: "achievements", label: "¿Logros de los que te sientes más orgulloso/a?", hint: "Jugadores A hablan de resultados y metas; B y C de eventos y personas.", type: "long" },
  { key: "low_points", label: "Puntos bajos en ese trabajo", hint: "¿Qué salió mal? · error más grande · ¿qué harías diferente? · ¿qué no te gustaba?", type: "long" },
  { key: "boss", label: "Nombre del jefe y cómo fue trabajar con él", type: "long" },
  { key: "boss_strength", label: "Mayor fortaleza de tu jefe como líder", type: "long" },
  { key: "boss_gap", label: "Mayor área de oportunidad de tu jefe", hint: "Escucha: así hablará luego de ti como líder.", type: "long" },
  { key: "leaders", label: "Preguntas para líderes (solo si tuvo gente a cargo)", hint: "¿Qué pensaba tu jefe de trabajar contigo? · fortaleza/debilidad · nota del equipo heredado · cambios · ¿contrataste/despediste? · ¿qué dirá tu equipo?", type: "long" },
  { key: "why_left", label: "¿Por qué dejó el trabajo?", type: "long" },
];
export const OPERATIONS_CLOSE: Section[] = [
  {
    title: "Valores",
    fields: [
      { key: "health", label: "¿Qué haces para mantenerte saludable?", type: "long" },
      { key: "spiritual", label: "¿Cuáles son tus creencias espirituales y cómo las practicas?", type: "long" },
      { key: "sleep", label: "¿A qué hora te duermes y te despiertas frecuentemente?", type: "text" },
      { key: "day", label: "Cuéntame cómo es un día normal para ti", type: "long" },
      { key: "values_pass", label: "¿Pasa?", type: "yesno" },
    ],
  },
  {
    title: "Finalización",
    fields: [
      { key: "fail_reason", label: "Motivo por el que no pasa (si aplica)", type: "long" },
      { key: "expectations", label: "Selling + expectativas dadas al candidato", type: "long" },
    ],
  },
];
export const TECHNICAL_SECTIONS: Section[] = [
  {
    title: "Entrevista técnica",
    intro: "Formato general: registra lo que evaluaste según el puesto.",
    fields: [
      { key: "criteria", label: "Conocimientos técnicos evaluados", type: "long" },
      { key: "practical", label: "Prueba práctica o caso evaluado", type: "long" },
      { key: "strengths", label: "Fortalezas técnicas", type: "long" },
      { key: "improve", label: "Áreas de mejora", type: "long" },
      { key: "comments", label: "Comentarios generales", type: "long" },
    ],
  },
];
export const MAX_REFERENCES = 7;
export const MAX_JOBS = 5;
