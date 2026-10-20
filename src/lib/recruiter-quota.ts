/** Hiring quota split per recruiter. Trainers (e.g. Roberto Sánchez) carry certification metrics, not hiring quota. */
export const RECRUITER_SHARES: { match: string; name: string; share: number }[] = [
  { match: "morena", name: "Morena Lemus", share: 0.65 },
  { match: "kennia", name: "Kennia Vasquez", share: 0.35 },
];
export const CERTIFICATION_OWNER = { match: "roberto", name: "Roberto Sánchez" };

/** Share of a goal, rounded up so the split never falls short of the total. */
export const quotaFor = (total: number, share: number) => Math.ceil(total * share);

export const shareOf = (name: string) =>
  RECRUITER_SHARES.find((r) => name.toLowerCase().includes(r.match)) ?? null;

type Row = {
  recruiter: string;
  sentToSecondFilter: boolean;
  recruitmentDecidedAt: string | null;
  managerDecision: string;
  managerDecidedAt: string | null;
  training: { status: string; certification: string; outcomeAt: string | null } | null;
};

const inPeriod = (d: string | null, from: string) => Boolean(d && d.slice(0, 10) >= from);

/** Per-recruiter progress since `from` (YYYY-MM-DD). Quality = approved to Training ÷ sent to Second Filter. */
export function recruiterBoard(rows: Row[], from: string) {
  return RECRUITER_SHARES.map((r) => {
    const mine = rows.filter((x) => x.recruiter.toLowerCase().includes(r.match));
    const sent = mine.filter((x) => x.sentToSecondFilter && inPeriod(x.recruitmentDecidedAt, from)).length;
    const approved = mine.filter((x) => x.managerDecision === "Aprobado" && inPeriod(x.managerDecidedAt, from)).length;
    return { ...r, sent, approved, quality: sent ? Math.round((approved / sent) * 100) : null };
  });
}

/** Certification results of trainees whose outcome landed since `from`. */
export function certificationBoard(rows: Row[], from: string) {
  const done = rows.filter((x) => x.training && inPeriod(x.training.outcomeAt, from) && (x.training.certification === "CERTIFIED" || x.training.certification === "NOT CERTIFIED"));
  const certified = done.filter((x) => x.training!.certification === "CERTIFIED").length;
  const inTraining = rows.filter((x) => x.training?.status === "IN TRAINING").length;
  return { certified, notCertified: done.length - certified, inTraining, rate: done.length ? Math.round((certified / done.length) * 100) : null };
}
