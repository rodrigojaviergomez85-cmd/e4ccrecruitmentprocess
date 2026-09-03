export const QUESTION_1 =
  "Tell us about yourself and explain why you would like to work as an English teacher at E4CC.";

export const QUESTION_2_EXPERIENCED =
  "Tell us about your previous teaching experience. Describe a class or teaching experience that you remember well. What happened, what did you do, and what did you learn from it?";

export const QUESTION_2_NO_EXPERIENCE =
  "Tell us about an experience where you helped someone learn something new. What happened, what did you do, and what did you learn from the experience?";

export const VIDEO_TITLES: Record<number, string> = {
  1: "About Me & Motivation",
  2: "Teaching Experience",
};

export const EXPERIENCE_OPTIONS = [
  "No experience",
  "Less than 6 months",
  "6–11 months",
  "1–2 years",
  "3–5 years",
  "More than 5 years",
] as const;

export type ExperienceOption = (typeof EXPERIENCE_OPTIONS)[number];

/** Approximate months for each range, including legacy stored values. */
const EXPERIENCE_MONTHS: Record<string, number> = {
  "No experience": 0,
  "Less than 6 months": 3,
  "6–11 months": 8,
  "Less than 1 year": 8,
  "1–2 years": 18,
  "3–5 years": 48,
  "More than 5 years": 72,
};

export function experienceMonths(value: string | null | undefined) {
  return EXPERIENCE_MONTHS[value ?? ""] ?? 0;
}

/**
 * Eligibility: 1+ year of teaching/training, OR 1+ year of call center
 * together with at least 6 months of teaching/training.
 */
export function isEligible(teaching: string, callcenter: string) {
  const t = experienceMonths(teaching);
  const c = experienceMonths(callcenter);
  return t >= 12 || (c >= 12 && t >= 6);
}

export const STATUS_OPTIONS = [
  "New",
  "Reviewing",
  "English Approved",
  "Interview",
  "Rejected",
  "Not eligible",
  "Hired",
] as const;


export const PREP_SECONDS = 30;
export const MIN_RECORD_SECONDS = 60;
export const MAX_RECORD_SECONDS = 120;
export const MAX_ATTEMPTS = 2;

export function questionForSlot(slot: number, experience: string) {
  if (slot === 1) return QUESTION_1;
  return experience === "No experience" ? QUESTION_2_NO_EXPERIENCE : QUESTION_2_EXPERIENCED;
}

export type CefrBand = {
  label: string;
  tone: "danger" | "warning" | "success";
  emoji: string;
};

const CEFR_ORDER = ["A1", "A2", "B1", "B1+", "B2", "B2+", "C1", "C2"];

export function cefrBand(cefr: string | null | undefined): CefrBand {
  if (!cefr) return { label: "Not analyzed yet", tone: "warning", emoji: "⏳" };
  const idx = CEFR_ORDER.indexOf(cefr.toUpperCase());
  if (idx < 0) return { label: "Not analyzed yet", tone: "warning", emoji: "⏳" };
  if (idx < CEFR_ORDER.indexOf("B2"))
    return { label: "Below Preferred English Level", tone: "danger", emoji: "🔴" };
  if (cefr.toUpperCase() === "B2")
    return { label: "Human Review Recommended", tone: "warning", emoji: "🟡" };
  if (cefr.toUpperCase() === "B2+")
    return { label: "Strong English", tone: "success", emoji: "🟢" };
  return { label: "Very Strong English", tone: "success", emoji: "🟢" };
}

export const SCORE_CATEGORIES = [
  { key: "grammar", label: "Grammar accuracy", weight: 40 },
  { key: "pronunciation", label: "Pronunciation", weight: 20 },
  { key: "fluency", label: "Fluency", weight: 20 },
  { key: "comprehension", label: "Comprehension / relevance", weight: 10 },
  { key: "intonation", label: "Intonation & natural speech", weight: 10 },
] as const;

export type DimensionKey = (typeof SCORE_CATEGORIES)[number]["key"];

export const ASSESSMENT_STATUSES = ["Scored", "Manual Review", "Re-record Required"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export type ErrorFinding = {
  category: string;
  example: string;
  severity: "Minor" | "Moderate" | "Major" | "Critical";
  frequency: "Isolated" | "Recurring" | "Systematic";
};

export type ScoreBand = {
  label: string;
  tone: "danger" | "warning" | "success";
};

/** Internal E4CC recruitment interpretation of the proficiency score. */
export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score == null) return { label: "Not scored", tone: "warning" };
  if (score >= 90) return { label: "Exceptional spoken English", tone: "success" };
  if (score >= 80) return { label: "Coach-ready English", tone: "success" };
  if (score >= 70) return { label: "Borderline / development needed", tone: "warning" };
  if (score >= 60) return { label: "Below coach standard", tone: "danger" };
  return { label: "Significant foundational gaps", tone: "danger" };
}

export type CapFlags = {
  past_tense_failure?: boolean;
  comprehension_failure?: boolean;
  intelligibility_failure?: boolean;
  basic_sentence_failure?: boolean;
};

export type ProficiencyResult = {
  score: number;
  weighted: number;
  dimensions: Record<DimensionKey, number>;
  appliedCaps: string[];
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/**
 * Deterministic scoring: weighted average of the AI's dimension scores, then
 * hard caps and critical gates. The AI never produces the final number.
 */
export function computeProficiencyScore(
  rawDimensions: Partial<Record<DimensionKey, number>>,
  errors: ErrorFinding[],
  flags: CapFlags,
): ProficiencyResult {
  const dimensions = Object.fromEntries(
    SCORE_CATEGORIES.map((c) => [c.key, clamp(Number(rawDimensions[c.key] ?? 0))]),
  ) as Record<DimensionKey, number>;

  const appliedCaps: string[] = [];

  const has = (category: RegExp, frequency: ErrorFinding["frequency"][]) =>
    errors.some((e) => category.test(e.category ?? "") && frequency.includes(e.frequency));

  // Past-tense failure: grammar <= 55, overall <= 59.
  const pastTenseFailure =
    Boolean(flags.past_tense_failure) ||
    errors.some(
      (e) =>
        /past|tense/i.test(`${e.category} ${e.example}`) &&
        e.frequency === "Systematic" &&
        (e.severity === "Major" || e.severity === "Critical"),
    );
  if (pastTenseFailure && dimensions.grammar > 55) {
    dimensions.grammar = 55;
    appliedCaps.push("Systematic past-tense failure — grammar capped at 55.");
  }

  let score = clamp(
    SCORE_CATEGORIES.reduce((sum, c) => sum + dimensions[c.key] * (c.weight / 100), 0),
  );

  const cap = (limit: number, reason: string) => {
    if (score > limit) {
      score = limit;
      appliedCaps.push(reason);
    }
  };

  if (has(/grammar/i, ["Recurring", "Systematic"]))
    cap(79, "Recurring grammar errors — score capped below 80.");
  if (has(/pronunc/i, ["Recurring", "Systematic"]))
    cap(79, "Recurring pronunciation errors — score capped below 80.");

  if (pastTenseFailure) cap(59, "Systematic past-tense failure — score capped below 60.");
  if (flags.comprehension_failure) cap(59, "Serious comprehension problems — capped below 60.");
  if (flags.intelligibility_failure)
    cap(59, "Severe pronunciation / intelligibility problems — capped below 60.");
  if (flags.basic_sentence_failure)
    cap(59, "Cannot construct basic English sentences — capped below 60.");

  const weighted = clamp(
    SCORE_CATEGORIES.reduce((sum, c) => sum + dimensions[c.key] * (c.weight / 100), 0),
  );

  return { score, weighted, dimensions, appliedCaps };
}

