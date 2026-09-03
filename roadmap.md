# E4CC recruitment roadmap

## Phase 1 — Country, city, phone (DONE)
- [x] `countries` / `cities` tables + seeds, admin-editable
- [x] Standardized `country_code`, `city_id`, `city_other`, `phone_e164`, consent on applications
- [x] Searchable country/city dropdowns, dependent city, "Other city"
- [x] Country-aware dial code + E.164 validation
- [x] Consent checkbox + privacy notice
- [x] Legacy data backfilled (no deletions)
- [x] Country filter/column in recruiter dashboard
- [x] `staff_countries` + server-side country scoping for recruiters
- [x] Admin Settings page (countries, cities, recruiter country access)

## Phase 2 — Invitation-only staff accounts & security (DONE)
- [x] Roles admin/recruiter/viewer, `staff_profiles`, active flag, last login
- [x] Remove public sign-up; keep forgot password
- [x] Admin "Staff Access" page: create user, one-time temp password, activate/deactivate, reset link, roles + countries
- [x] `must_change_password` flow (`/change-password`)
- [x] Google login limited to authorized active staff (StaffGate signs out others)
- [x] Route guards for every staff page (StaffGate) + server-side checks; RLS on new tables
- [x] `audit_logs` table + events (staff created / access changed / activated / reset link / password change)

## Phase 3 — B2+ interview scheduling (DONE)
- [x] Ranked CEFR eligibility (server-side), manual override with note
- [x] Hashed scheduling tokens with expiry
- [x] Interview settings, availability, blocked dates, interviewers
- [x] UTC appointments, anti-double-booking constraint, statuses
- [x] Confirmation, reschedule/cancel, ICS + Google Calendar
- [x] Dashboard appointment columns/filters
- [x] Reminder job (cron) + `reminder_logs`, email now, WhatsApp disabled until configured

## Pending configuration
- [ ] Email provider secret (`RESEND_API_KEY`, `EMAIL_FROM`) — until then emails are logged as "Email not configured"
- [ ] WhatsApp secrets (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) — UI shows "WhatsApp not configured"
- [ ] Schedule the cron POST to `/api/public/cron/reminders` (bearer `LOVABLE_CRON_SECRET`)
