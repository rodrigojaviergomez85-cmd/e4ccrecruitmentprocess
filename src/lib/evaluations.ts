/** Shared, client-safe domain model for the E4CC Interview Evaluations module. */

export const EVALUATION_STATUSES = [
  "Not started",
  "In progress",
  "Submitted",
  "Retake pending",
  "Reopened",
] as const;
export const isLockedStatus = (status?: string | null) =>
  status === "Submitted" || status === "Retake pending";

export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const FINAL_RESULTS = ["Approved for last step", "Retake required", "Not approved"] as const;
export type FinalResult = (typeof FINAL_RESULTS)[number];

export const NOT_APPROVED_REASONS = [
  "Declined offer",
  "No availability",
  "No English level",
  "No grammar knowledge",
  "No commitment",
  "No coach profile or E4CC values alignment",
  "Grammar Test not completed",
  "No equipment or technical requirements",
  "Ex-coach",
  "Approved for second filter but never showed up",
  "Other",
] as const;

/** Not-approved reasons that allow the candidate to schedule again right away (no waiting date). */
export const NOT_APPROVED_IMMEDIATE_RETRY_REASONS: readonly string[] = [
  "Ex-coach",
  "Approved for second filter but never showed up",
];

export const HIRING_BONUS_OPTIONS = [
  "$500 — Teaching/Call Center experience, Superstar Onsite profile",
  "$200 — Teaching/Call Center experience, Great Onsite profile",
  "$100 — Teaching/Call Center experience, Superstar/Great Online profile",
  "No hiring bonus — PB/PB+ profile",
] as const;

/** Verb bank offered to the evaluator. They assess between 5 and 10 of them. */
export const VERB_BANK = [
  "Ride / Rode / Ridden",
  "Freeze / Froze / Frozen",
  "Swim / Swam / Swum",
  "Hide / Hid / Hidden",
  "Teach / Taught / Taught",
  "Hear / Heard / Heard",
  "Drive / Drove / Driven",
  "Withdraw / Withdrew / Withdrawn",
  "Fly / Flew / Flown",
  "Hold / Held / Held",
  "Grow / Grew / Grown",
  "Know / Knew / Known",
  "Catch / Caught / Caught",
  "Leave / Left / Left",
  "Bring / Brought / Brought",
  "Make / Made / Made",
  "Seek / Sought / Sought",
  "Build / Built / Built",
  "Fight / Fought / Fought",
  "Ring / Rang / Rung",
] as const;

export const SCHEDULE_OPTIONS = [
  "Weekends Only",
  "5:50 PM + Weekends",
  "AM + Weekends",
  "PM + Weekends",
  "6:30 PM–9:35 PM Online",
  "Full Time AM/PM",
] as const;

export const REFERRAL_SOURCES = ["Facebook", "Instagram", "Other"] as const;

export const ONLINE_MINIMUM_SPECS = [
  "Intel i3 8th generation or newer",
  "AMD Ryzen 3 or equivalent",
  "8 GB RAM",
  "Working camera and microphone",
  "Stable internet connection, minimum 10 Mbps",
] as const;

export const VARIABLE_SCHEDULE_WARNING =
  "Potential disqualifier: the candidate may not be able to guarantee their E4CC classes. Document the situation. The candidate may reapply if their work schedule changes.";

export const ENGLISH_INTRO =
  "This interview may last from 20 to 30 minutes. We will review your English, work experience, goals and aspirations. At the end, you will have an opportunity to ask questions.";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B1+", "B2", "B2+", "C1", "C2"] as const;

export const WRITING_TOPICS = [
  "The role of artificial intelligence in modern language education",
  "How teachers can foster student autonomy in online or hybrid English classes",
  "Whether governments should regulate artificial intelligence",
] as const;

export const ENGLISH_ACTIVITIES = [
  { key: "past_question", label: "Question in past (previous job, favorite movie…)" },
  { key: "tenses", label: "Grammar tenses: when, how and example" },
  { key: "mistakes_wh", label: "Mistakes and WH questions roleplay" },
] as const;

export const SECTIONS = [
  { key: "candidate", label: "Candidate and Position" },
  { key: "equipment", label: "Equipment and Internet", onlineOnly: true },
  { key: "profile", label: "Profile, Availability and Expectations" },
  { key: "english", label: "English and Grammar Evaluation" },
  { key: "studies", label: "Studies" },
  { key: "jobs", label: "Chronological Job Experience" },
  { key: "values", label: "Goals, Motivation and E4CC Values" },
  { key: "result", label: "Final Result" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const DEFAULT_WEIGHTS = {
  english: 20,
  grammar: 15,
  verbs: 10,
  teaching: 20,
  experience: 10,
  availability: 15,
  values: 10,
};

export type Weights = typeof DEFAULT_WEIGHTS;

export const SCORE_CATEGORY_LABELS: Record<keyof Weights, string> = {
  english: "English communication",
  grammar: "Grammar knowledge",
  verbs: "Irregular verbs",
  teaching: "Teaching / class roleplay",
  experience: "Experience",
  availability: "Availability and commitment",
  values: "E4CC values and cultural fit",
};

export type VerbResult = { verb: string; correct: boolean };

export function verbStats(verbs: VerbResult[]) {
  const evaluated = verbs.filter((v) => v.verb.trim().length > 0);
  const correct = evaluated.filter((v) => v.correct).length;
  const incorrect = evaluated.length - correct;
  const accuracy = evaluated.length ? Math.round((correct / evaluated.length) * 100) : 0;
  return { evaluated: evaluated.length, correct, incorrect, accuracy };
}

export function clampScore(value: unknown, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), max);
}

export function totalScore(
  categoryScores: Record<string, unknown>,
  weights: Weights = DEFAULT_WEIGHTS,
) {
  return (Object.keys(weights) as Array<keyof Weights>).reduce(
    (sum, key) => sum + clampScore(categoryScores[key], weights[key]),
    0,
  );
}

const CEFR_ORDER = CEFR_LEVELS as readonly string[];

/** Positive = live interview level is higher than the recorded-video level. */
export function levelDifference(previous?: string | null, live?: string | null) {
  const a = CEFR_ORDER.indexOf((previous ?? "").toUpperCase());
  const b = CEFR_ORDER.indexOf((live ?? "").toUpperCase());
  if (a < 0 || b < 0) return null;
  return b - a;
}

export type EvaluationSections = Record<string, Record<string, unknown>>;

type ComplianceInput = {
  sections: EvaluationSections;
  isOnline: boolean;
  verbs: VerbResult[];
  jobsCount: number;
  finalResult?: string | null;
  comments?: string | null;
  redFlags?: string | null;
  lastRoleplayDate?: string | null;
  retakeDate?: string | null;
};

const filled = (v: unknown) =>
  v !== null && v !== undefined && String(v).trim().length > 0 && String(v) !== "undefined";

/** Compliance items only count when they apply to this candidate. */
export function complianceItems(input: ComplianceInput) {
  const s = input.sections ?? {};
  const get = (section: string, key: string) => (s[section] ?? {})[key];
  const needsNextStep =
    input.finalResult === "Approved for last step" || input.finalResult === "Retake required";

  const items: Array<{ label: string; applies: boolean; done: boolean }> = [
    {
      label: "Applicant information reviewed",
      applies: true,
      done: Boolean(get("candidate", "reviewed")),
    },
    {
      label: "Grammar Test result documented",
      applies: true,
      done: filled(get("grammar_test", "completed")),
    },
    {
      label: "Equipment check completed (Online)",
      applies: input.isOnline,
      done: filled(get("equipment", "meets_requirements")),
    },
    {
      label: "Availability confirmed",
      applies: true,
      done: filled(get("profile", "availability_required")),
    },
    {
      label: "Payment and agreement reviewed",
      applies: true,
      done: filled(get("profile", "agrees_payment")),
    },
    {
      label: "English activities documented",
      applies: true,
      done: input.verbs.filter((v) => v.verb.trim()).length >= 5,
    },
    { label: "Job history completed", applies: true, done: input.jobsCount >= 1 },
    { label: "Final result selected", applies: true, done: filled(input.finalResult) },
    {
      label: "Red flags or comments documented",
      applies: true,
      done: filled(input.comments) || filled(input.redFlags),
    },
    {
      label: "Next-step date entered",
      applies: needsNextStep,
      done: filled(
        input.finalResult === "Retake required" ? input.retakeDate : input.lastRoleplayDate,
      ),
    },
  ];
  return items;
}

export function complianceScore(input: ComplianceInput) {
  const applicable = complianceItems(input).filter((i) => i.applies);
  if (!applicable.length) return 0;
  return Math.round((applicable.filter((i) => i.done).length / applicable.length) * 100);
}

/** Required fields before an evaluation can be submitted. */
export function missingRequired(input: ComplianceInput): string[] {
  const s = input.sections ?? {};
  const get = (section: string, key: string) => (s[section] ?? {})[key];
  const missing: string[] = [];
  if (!filled(get("candidate", "lob"))) missing.push("LOB (Online or Onsite)");
  if (!filled(get("grammar_test", "completed"))) missing.push("Grammar Test answer");
  if (!filled(get("profile", "availability_required"))) missing.push("Availability confirmation");
  if (input.verbs.filter((v) => v.verb.trim()).length < 5)
    missing.push("At least 5 irregular verbs evaluated");
  if (input.jobsCount < 1) missing.push("At least one job history entry");
  if (!filled(input.finalResult)) missing.push("Final result");

  if (input.finalResult === "Approved for last step") {
    if (!filled(input.comments)) missing.push("Interview comments");
    if (!filled(input.redFlags)) missing.push("Red flags (or 'No red flags identified')");
    if (!filled(input.lastRoleplayDate)) missing.push("Last roleplay interview date");
  }
  if (input.finalResult === "Retake required") {
    if (!filled(get("result", "retake_reason"))) missing.push("Retake reason");
    if (!filled(get("result", "retake_improvements"))) missing.push("Areas to improve");
    if (!filled(input.retakeDate)) missing.push("Retake date");
    if (!filled(input.comments)) missing.push("Evaluator comments");
  }
  if (input.finalResult === "Not approved") {
    const reasons = (s["result"]?.["not_approved_reasons"] as string[] | undefined) ?? [];
    if (!reasons.length) missing.push("At least one rejection reason");
    if (!filled(input.comments)) missing.push("Final interview comments");
    if (!filled(input.redFlags)) missing.push("Red flags identified");
  }
  if (input.isOnline && !filled(get("equipment", "meets_requirements")))
    missing.push("Equipment and internet check");
  return missing;
}

/** Result-specific requirements used when an evaluator ends an interview early. */
export function missingEarlyFinish(input: ComplianceInput): string[] {
  const s = input.sections ?? {};
  const missing: string[] = [];
  if (!filled(input.finalResult)) return ["Final result"];

  if (input.finalResult === "Approved for last step") {
    if (!filled(input.comments)) missing.push("Interview comments");
    if (!filled(input.redFlags)) missing.push("Red flags (or 'No red flags identified')");
    if (!filled(input.lastRoleplayDate)) missing.push("Last roleplay interview date");
  }
  if (input.finalResult === "Retake required") {
    if (!filled(s["result"]?.["retake_reason"])) missing.push("Retake reason");
    if (!filled(s["result"]?.["retake_improvements"])) missing.push("Areas to improve");
    if (!filled(input.retakeDate)) missing.push("Retake date");
    if (!filled(input.comments)) missing.push("Evaluator comments");
  }
  if (input.finalResult === "Not approved") {
    const reasons = (s["result"]?.["not_approved_reasons"] as string[] | undefined) ?? [];
    if (!reasons.length) missing.push("At least one rejection reason");
    if (!filled(input.comments)) missing.push("Final interview comments");
    if (!filled(input.redFlags)) missing.push("Red flags identified");
  }
  return missing;
}

export const STATUS_FOR_RESULT: Record<string, string> = {
  "Approved for last step": "Pending Second Filter",
  "Retake required": "Reviewing",
  "Not approved": "Rejected",
};
