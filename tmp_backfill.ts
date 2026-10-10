import { syncCalendly } from "@/lib/calendly.server";
const t = Date.now();
const r = await syncCalendly({ sinceDays: Number(process.argv[2] ?? 30), sendEmails: false });
console.log(JSON.stringify({ ...r, unmatched: r.unmatched.length, ms: Date.now() - t }));
