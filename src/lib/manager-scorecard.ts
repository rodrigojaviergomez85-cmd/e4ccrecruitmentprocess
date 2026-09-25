/**
 * Manager second (final) filter scorecard. Criteria, maxima and gates come from
 * the "Proceso Segundo Filtro Académico E4CC" workbook (EVALUACIÓN sheet).
 * Client-safe: shared by the form and the server.
 */

export type Criterion = { key: string; label: string; hint: string; expected?: string; max: number };
export type ScoreSection = {
  key: "profile" | "grammar" | "demo" | "coachability" | "communication";
  title: string;
  max: number;
  gate: number | null;
  criteria: Criterion[];
};

export const MANAGER_SECTIONS: ScoreSection[] = [
  {
    key: "profile",
    title: "Profile and Information Confirmation",
    max: 10,
    gate: null,
    criteria: [
      { key: "p1", label: "Availability and conditions", hint: "Reconfirm modality, branch, class schedule, training and start date.", max: 3 },
      { key: "p2", label: "Experience and timeline", hint: "Reconfirm companies, positions, dates, gaps, achievements, supervisor and reasons for leaving.", max: 4 },
      { key: "p3", label: "Consistency / ownership", hint: "Dig into contradictions; observe honesty, clarity and responsibility.", max: 3 },
    ],
  },
  {
    key: "grammar",
    title: "Grammar and English Knowledge",
    max: 30,
    gate: 21,
    criteria: [
      { key: "g1", label: "Explain Simple Present: use, structure and one example.", expected: "Routines/facts; do/does; 3rd person -s.", hint: "", max: 3 },
      { key: "g2", label: "Explain Present Progressive: use, structure and one example.", expected: "Action now/temporary; am/is/are + verb-ing.", hint: "", max: 3 },
      { key: "g3", label: "Explain Simple Past: use, structure and one example.", expected: "Finished past; did; past form.", hint: "", max: 3 },
      { key: "g4", label: "Explain Past Progressive: use, structure and one example.", expected: "Ongoing past; was/were + verb-ing.", hint: "", max: 3 },
      { key: "g5", label: "Correct: She work every Saturday.", expected: "She works every Saturday.", hint: "", max: 3 },
      { key: "g6", label: "Correct: Yesterday he doesn't call me.", expected: "Yesterday he didn't call me.", hint: "", max: 3 },
      { key: "g7", label: "Correct: They was studying when I arrived.", expected: "They were studying when I arrived.", hint: "", max: 3 },
      { key: "g8", label: "Correct: I have went to that branch twice.", expected: "I have gone to that branch twice.", hint: "", max: 3 },
      { key: "g9", label: "Correct: I didn't saw the message.", expected: "I didn't see the message.", hint: "", max: 3 },
      { key: "g10", label: "Correct: I am working here since 2022.", expected: "I have worked / have been working here since 2022.", hint: "", max: 3 },
    ],
  },
  {
    key: "demo",
    title: "Teaching Demo (first attempt)",
    max: 25,
    gate: 15,
    criteria: [
      { key: "d1", label: "Accuracy", hint: "Content and examples are grammatically correct.", max: 4 },
      { key: "d2", label: "Clarity and structure", hint: "Clear objective, orderly explanation and simple language.", max: 4 },
      { key: "d3", label: "Modeling / examples", hint: "Gives a useful model before asking for production.", max: 4 },
      { key: "d4", label: "Engagement + checks", hint: "Involves the learner, asks checking questions and verifies understanding.", max: 5 },
      { key: "d5", label: "Feedback / correction", hint: "Detects errors, explains and lets the learner correct.", max: 4 },
      { key: "d6", label: "Presence + time", hint: "Energy, confidence, voice, posture and effective use of time.", max: 4 },
    ],
  },
  {
    key: "coachability",
    title: "Coachability (Feedback + Retake)",
    max: 25,
    gate: 18,
    criteria: [
      { key: "c1", label: "Receptiveness", hint: "Accepts open and honest feedback and listens without interrupting or defending.", max: 5 },
      { key: "c2", label: "Understanding", hint: "Explains in their own words what must change.", max: 4 },
      { key: "c3", label: "Ownership", hint: "Does not blame the context; recognises the opportunity and asks for clarity.", max: 4 },
      { key: "c4", label: "Application in retake", hint: "Implements exactly the instruction in the same segment.", max: 8 },
      { key: "c5", label: "Observable improvement", hint: "The second attempt clearly improves the targeted behaviour.", max: 4 },
    ],
  },
  {
    key: "communication",
    title: "Professionalism and English Communication",
    max: 10,
    gate: null,
    criteria: [
      { key: "e1", label: "English communication", hint: "Fluency, comprehension, pronunciation and functional accuracy for teaching.", max: 4 },
      { key: "e2", label: "Instructions", hint: "Gives concise, understandable instructions and checks the task.", max: 3 },
      { key: "e3", label: "Professionalism", hint: "Punctuality, preparation, respectful attitude and environment.", max: 3 },
    ],
  },
];

/** Per-item verification a Manager records next to each Recruitment answer. */
export const MANAGER_VERIFICATION_STATES = [
  ["confirmed", "Confirmed"],
  ["clarification", "Needs Clarification"],
  ["discrepancy", "Discrepancy Found"],
  ["not_reviewed", "Not Reviewed"],
] as const;

export type ManagerVerificationState = (typeof MANAGER_VERIFICATION_STATES)[number][0];

/** Double-check items the Manager confirms before deciding. */
export const VERIFICATION_CHECKS = [
  ["schedule", "Class schedule confirmed"],
  ["availability", "Availability / training start date confirmed"],
  ["work_info", "Work information confirmed"],
  ["leaving_reasons", "Reasons for leaving confirmed"],
  ["references", "References reviewed"],
  ["equipment", "Equipment and internet reviewed"],
  ["modality", "Modality / branch confirmed"],
  ["red_flags", "Red flags investigated with evidence"],
  ["consistency", "Application, CV and first interview are consistent"],
] as const;

export const MANAGER_DECISIONS = ["Approved for Training", "Retake", "Not Approved", "No Show"] as const;
export type ManagerDecision = (typeof MANAGER_DECISIONS)[number];

export const RECOMMENDATIONS = {
  approved: "Recommended – Approved for Training",
  retake: "Recommended – Exceptional Retake",
  not: "Recommended – Not Approved",
} as const;

export const COHORT_PENDING = "Approved for Training – Cohort Pending";

export function clampScores(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of MANAGER_SECTIONS)
    for (const c of s.criteria) {
      const v = Number(raw[c.key]);
      if (raw[c.key] !== undefined && raw[c.key] !== null && raw[c.key] !== "" && Number.isFinite(v))
        out[c.key] = Math.max(0, Math.min(c.max, Math.round(v)));
    }
  return out;
}

export function scoreManager(scores: Record<string, number>, criticalRedFlag: boolean) {
  const sections = MANAGER_SECTIONS.map((s) => {
    const points = s.criteria.reduce((sum, c) => sum + (scores[c.key] ?? 0), 0);
    const scored = s.criteria.filter((c) => scores[c.key] !== undefined).length;
    return {
      key: s.key,
      title: s.title,
      points,
      max: s.max,
      gate: s.gate,
      passed: s.gate === null ? true : points >= s.gate,
      complete: scored === s.criteria.length,
    };
  });
  const total = sections.reduce((sum, s) => sum + s.points, 0);
  const complete = sections.every((s) => s.complete);
  const gatesPassed = sections.every((s) => s.passed) && !criticalRedFlag;
  const recommendation = !complete
    ? null
    : !gatesPassed || total < 70
      ? RECOMMENDATIONS.not
      : total >= 80
        ? RECOMMENDATIONS.approved
        : RECOMMENDATIONS.retake;
  return {
    sections,
    total,
    complete,
    gatesPassed,
    gates: {
      grammar: sections.find((s) => s.key === "grammar")!.passed,
      demo: sections.find((s) => s.key === "demo")!.passed,
      coachability: sections.find((s) => s.key === "coachability")!.passed,
      noCriticalRedFlag: !criticalRedFlag,
    },
    recommendation,
  };
}

export const MANAGER_MAX_TOTAL = MANAGER_SECTIONS.reduce((s, x) => s + x.max, 0);
