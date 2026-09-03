# E4CC Recruitment Process (post-evaluation phase)

Adds a new candidate-facing checklist page between the English evaluation result and interview scheduling, switches scheduling to the existing Calendly link, and surfaces everything in the current recruiter dashboard. Modules 1 and 2 stay untouched.

## Candidate flow

1. Candidate finishes videos, the existing AI evaluation runs (unchanged).
2. Eligible levels (B1, B1+, B2, B2+, C1, C2) continue; A1/A2 keep the current thank-you screen.
3. Eligible candidates are sent to a new page **E4CC Recruitment Process**, reachable only through their existing secure application token — no token, no page, even by typing the URL.

Page content:

- Heading: "Welcome to E4CC's Coach Recruitment Process"
- Message: "Congratulations! You have been selected to continue to the next stage. Complete the following requirements to schedule your LIVE ZOOM INTERVIEW with the E4CC Recruitment Team."
- Checklist with green checks and auto-saved progress (saved on every change, restored on return):
  1. Device Requirement — statement + required confirmation checkbox
  2. Grammar Test — "Take the Grammar Test" button opening TestGorilla in a new tab, "Estimated time: 12 minutes.", status Not started / Link opened / Candidate marked as completed / Verified by recruiter, plus the confirmation checkbox
  3. Review Grammar Topics — button to the Drive material + required checkbox
  4. Resume and Work References — single resume upload (PDF/DOC/DOCX, max 10 MB, filename shown, replaceable, one active file, private storage) and the two reference forms with the accuracy declaration
  5. Prepare a Sample Class — button to the YouTube video + required checkbox
  6. Schedule Your Interview — locked until everything above is complete; missing items listed explicitly

When all requirements are complete: "Excellent! You have completed all the requirements. You may now select the date and time for your LIVE ZOOM INTERVIEW.", candidate status becomes **Ready to schedule**, and the Calendly inline embed for `teachingjobs4callcenters/schedule` appears with name and email prefilled. If the embed fails to load, a "Schedule Your Interview" button opens the same Calendly URL. Opening the section sets status **Scheduling opened**. No booking is ever auto-marked as scheduled.

Work reference fields (x2, "Most Recent Position" and "Previous Position"): company, candidate position, start date, end date or "Currently working here", supervisor name, supervisor position, supervisor phone/WhatsApp (international format), supervisor email, country, reason for leaving, permission to contact.

## Recruiter dashboard (extends the current candidate profile)

New section on the existing candidate page showing: English level with the internal label **"B1 — Live English Validation Required"** for B1/B1+, requirements progress, device confirmation, Grammar Test status + recruiter-entered score + verified toggle + internal note, resume (opened via short-lived signed URL only), both work references with verification status (Pending verification / Contacted / Verified / Unable to verify / Invalid reference) and private notes, sample-class confirmation, and scheduling status. Recruiters can manually set Interview scheduled / Interview completed / No-show / Canceled.

## Technical notes

- Additive migration only: `recruitment_progress` (one row per application, checkbox flags, grammar test status/score/verified/notes, scheduling status), `work_references` (two rows per application), and resume columns on the existing application record. GRANTs + RLS on each new table; anonymous roles get no access, staff access follows the existing country-scoping and `has_role` helpers.
- Candidate reads/writes go through new server functions in `src/lib/candidate.functions.ts` style, authorized with the existing application-id + token owner check; every checklist field and the unlock decision is validated server-side, so changing frontend values cannot unlock scheduling.
- Resumes go to the existing private `candidate-media` bucket under a per-application path; recruiters open them through a short-lived signed URL, never a public URL.
- Eligibility keeps the existing ranked CEFR map (`MIN_SCHEDULING_RANK` = B1) and the existing experience rule and manual overrides — no change to evaluation logic.
- Calendly is loaded via its inline-embed script with `prefill` name/email; the current internal scheduler code stays in place but the candidate flow now points at Calendly.

## Out of scope (per request)

No custom calendar, no custom email or WhatsApp reminders, no Google Calendar, no changes to modules 1 and 2, recordings, evaluation, or visual identity.

## Manual configuration afterwards

Calendly booking confirmations/reminders are managed in your Calendly account; without a Calendly webhook, final interview statuses are set manually by recruiters.
