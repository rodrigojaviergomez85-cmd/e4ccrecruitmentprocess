# E4CC Recruitment — Location, Staff Security & Interview Scheduling

Delivered in three phases on the existing app and existing backend. No rebuild: current design, applications, videos, AI evaluation and dashboard stay intact. Every change is an additive migration with backfill — nothing is deleted.

## Phase 1 — Country, city and phone

**Applicant form**
- Country becomes a required searchable dropdown (El Salvador, Guatemala, Nicaragua, Honduras, Mexico, Colombia, Other), driven by a database table so Admins can edit the list.
- City stays disabled until a country is chosen, then lists only that country's cities, plus "Other city" which reveals a required free-text field.
- Phone loses the +34 placeholder: flag and dialing code follow the selected country, the applicant can switch the dialing country, and the number is validated and stored in E.164 format.
- New required consent checkbox: "I agree to receive updates about my application and interview by email and WhatsApp", with a short privacy notice about contact data and recordings being used only for recruitment.

**Data**
- New `countries` and `cities` tables (code, name, dial code, default timezone, active flag, sort order), seeded with the seven countries and their main cities.
- Applications gain `country_code`, `city_id`, `city_other`, `phone_e164`, `phone_country_code`, `contact_consent`, `consent_at`. Existing free-text country/city columns are kept and mapped by name where possible; unmatched values stay as-is and are visible in the dashboard.

**Dashboard**
- Country and city appear as columns and as filters.

**Scoping**
- `staff_countries` table lets Admins assign recruiters to one or more countries. Recruiters see only their countries; Admins see everything. Enforced server-side and in RLS, not just in the UI.

## Phase 2 — Invitation-only staff accounts and security

- Public "Need an account? Create one" is removed entirely; signup is impossible from the app. "Forgot password?" stays.
- Three roles: Admin (everything), Recruiter (permitted candidates, evaluations, interviews), Viewer (read-only).
- New `staff_profiles` table: full name, work email, role, active flag, `must_change_password`, last login.
- Admin-only **Staff Access** page: create a staff user (name, email, role, countries), generate a 16+ character temporary password shown once with a copy button, optionally email a secure invitation, activate/deactivate, send reset link, change role and countries, view last login. Existing passwords are never shown or recoverable.
- User creation runs only in a protected server function using the Admin API, after verifying the caller is an active Admin. Temporary passwords are never stored, logged or returned twice; `must_change_password` is set.
- First login redirects to a mandatory "Create a new password" page before any results are reachable.
- Google login is allowed only when the email matches an active staff profile; otherwise access is denied and the session is signed out.
- Route guard on every dashboard, candidate, video, evaluation, scheduling and staff page — enforced on the server, not by hiding links.
- RLS on every table: anonymous users can never read applicants, evaluations, appointments, staff profiles or reminder logs. Videos stay in the private bucket with short-lived signed URLs for authorized staff only.
- `audit_logs` table records account creation, role changes, candidate status changes, manual level overrides and appointment changes. Never records passwords, tokens, recordings or keys.

## Phase 3 — Interview scheduling for B2+

**Eligibility**
- Ranked CEFR mapping (never alphabetical): A1/A2/B1 not eligible; B2/B2+/C1/C2 eligible. Validated server-side on every scheduling request.
- Recruiters can manually approve or reject; every override requires a note and is written to the audit log.

**Candidate experience**
- Eligible candidates get status `qualified`, a congratulations screen with "Schedule your interview", an automatic email with a secure scheduling link, and the same invitation on WhatsApp when consent was given.
- Scheduling links use a high-entropy token, stored only as a hash, expiring after a configurable number of days. The scheduling page reveals nothing about other candidates.
- Candidates below B2 see a professional thank-you message, cannot see or URL-guess the calendar, and Admins configure whether they may reapply after 90 days.

**Admin Interview Settings**
Timezone (default America/El_Salvador), duration (default 15 min), buffer, minimum notice, maximum booking window, weekly days and hours, breaks, blocked dates and holidays, interviewers and their availability, max interviews per slot, default meeting link, reminder times, email and WhatsApp templates in English and Spanish, and country-to-interviewer assignment or round-robin — modeled on the Calendly page you referenced.

**Booking**
- Timezone guessed from the selected country, changeable by the candidate. Appointments stored in UTC and shown in both candidate and organization timezones. Past and unavailable slots are never offered.
- Double booking prevented by a unique constraint plus a transactional booking function: if two candidates pick the same slot, exactly one succeeds.
- Confirmation page with date, time, timezones, interviewer and meeting link; immediate confirmation email and WhatsApp; "Add to Google Calendar" and .ics download; secure reschedule and cancel links; the assigned recruiter is notified on booking, reschedule and cancellation.
- Statuses: Scheduled, Confirmed, Completed, No-show, Rescheduled, Canceled.

**Dashboard additions**
Scheduled date/time, interviewer, appointment status, reminder status, reschedule count, meeting link, manual reminder button, and filters for country, city, CEFR, candidate status, appointment status, interviewer and date.

**Reminders**
- Scheduled backend job: immediately after booking, 24 hours before, 1 hour before — all configurable.
- Email through Lovable Cloud Emails; WhatsApp through the Meta WhatsApp Cloud API with credentials kept in backend secrets. Until those credentials exist the UI says "WhatsApp not configured" rather than claiming a send.
- `reminder_logs` records channel, appointment, scheduled time, sent time, provider response and status; a unique key makes each reminder idempotent; temporary provider errors are retried; canceled and completed appointments are never reminded; recruiters can send a manual reminder.

## Technical notes

- Stack stays TanStack Start + the connected Lovable Cloud backend. Server logic uses `createServerFn`; the cron endpoint is a public API route protected by a shared secret.
- New tables: `countries`, `cities`, `staff_profiles`, `staff_countries`, `interviewers`, `interviewer_availability`, `blocked_dates`, `interview_settings`, `appointments`, `scheduling_tokens`, `reminder_logs`, `audit_logs`. Existing tables are extended with new nullable columns only.
- Secrets I will need from you at Phase 3: Meta WhatsApp Cloud API token, phone number ID and template names.
- First Admin: you sign in once on the login page, then I promote your account to Admin directly in the database; after that all further staff are created from the Staff Access page.

## Acceptance tests

Each phase ends with a verification pass covering: no public signup; anonymous users blocked from applicant/video data; inactive staff blocked; recruiters limited to their countries; recruiters unable to create Admins; temporary password forces a change on first login; country drives city list and dial code; B1 candidates blocked from the calendar even by direct URL; B2+ can book; concurrent booking of one slot yields one winner; rescheduling frees the old slot; canceled appointments get no reminders; each automatic reminder sent once; existing applications and videos still load; private video URLs unusable by unauthorized users.
