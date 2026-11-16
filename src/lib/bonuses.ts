/** Pure bonus rules: installment plans from the real certification date and 14/28 cut-off paydays. */
export type Installment = { month: number; amount: number };
export type BonusKind = "Hiring bonus" | "Referido";

export const PLANS: Record<number, Installment[]> = {
  500: [{ month: 2, amount: 100 }, { month: 4, amount: 150 }, { month: 6, amount: 250 }],
  200: [{ month: 1, amount: 50 }, { month: 3, amount: 50 }, { month: 6, amount: 100 }],
  100: [{ month: 1, amount: 50 }, { month: 3, amount: 50 }],
};

/** Hiring bonus amount from the interview recommendation text ("$200 — ..."); 0 when none. */
export function hiringBonusAmount(text: string | null | undefined): number {
  const m = /^\s*\$(\d+)/.exec(text ?? "");
  const n = m ? Number(m[1]) : 0;
  return PLANS[n] ? n : 0;
}

/** Longest daily block in hours from an agreed schedule like "Lunes a viernes: 9:00 AM–6:00 PM". */
export function dailyHours(schedule: string | null | undefined): number {
  const re = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
  const toMin = (h: string, m: string, ap: string) => ((Number(h) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m);
  let best = 0;
  for (const x of (schedule ?? "").matchAll(re)) best = Math.max(best, (toMin(x[4]!, x[5]!, x[6]!) - toMin(x[1]!, x[2]!, x[3]!)) / 60);
  return best;
}

/** Referral bonus: Online or part-time = $100; full-time onsite (6+ hours) = $200. */
export function referralBonusAmount(online: boolean, schedule: string | null | undefined): number {
  return !online && dailyHours(schedule) >= 6 ? 200 : 100;
}

/** Certified 1–15 → paid on the 14th; 16–31 → paid on the 28th, N calendar months later. */
export function payDate(certifiedOn: string, month: number): string {
  const [y, m, d] = certifiedOn.split("-").map(Number) as [number, number, number];
  const total = (m - 1) + month;
  const yy = y + Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-${d <= 15 ? "14" : "28"}`;
}

export function schedule(certifiedOn: string, amount: number) {
  return (PLANS[amount] ?? []).map((i) => ({ ...i, payOn: payDate(certifiedOn, i.month) }));
}

/** Next cut-off (14 or 28) on or after today. */
export function nextCutoff(today: string): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  if (d <= 14) return `${y}-${String(m).padStart(2, "0")}-14`;
  if (d <= 28) return `${y}-${String(m).padStart(2, "0")}-28`;
  return m === 12 ? `${y + 1}-01-14` : `${y}-${String(m + 1).padStart(2, "0")}-14`;
}
