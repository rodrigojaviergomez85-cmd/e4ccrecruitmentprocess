/** Country answer from the Calendly booking form ("Select Country you are applying from."). */
const NAMES: Record<string, { code: string; name: string }> = {
  "el salvador": { code: "SV", name: "El Salvador" },
  "guatemala": { code: "GT", name: "Guatemala" },
  "nicaragua": { code: "NI", name: "Nicaragua" },
  "honduras": { code: "HN", name: "Honduras" },
  "mexico": { code: "MX", name: "Mexico" },
  "méxico": { code: "MX", name: "Mexico" },
  "colombia": { code: "CO", name: "Colombia" },
};

type QA = { question?: string | null; answer?: string | null };

/** First recognized country in the answer; null when absent or unrecognized (e.g. USA). */
export function countryFromCalendlyAnswers(qas: QA[] | null | undefined): { code: string; name: string } | null {
  const qa = (qas ?? []).find((q) => /country/i.test(q.question ?? ""));
  if (!qa?.answer) return null;
  for (const line of qa.answer.split(/\n|,/)) {
    const hit = NAMES[line.trim().toLowerCase()];
    if (hit) return hit;
  }
  return null;
}
