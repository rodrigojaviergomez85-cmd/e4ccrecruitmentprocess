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

## Phase 2 — Invitation-only staff accounts & security (TODO)
- [ ] Roles admin/recruiter/viewer, `staff_profiles`, active flag, last login
- [ ] Remove public sign-up; keep forgot password
- [ ] Admin "Staff Access" page: create user, one-time temp password, activate/deactivate, reset link, roles + countries
- [ ] `must_change_password` flow
- [ ] Google login limited to authorized active staff
- [ ] Route guards for every staff page; RLS review
- [ ] `audit_logs` table + events

## Phase 3 — B2+ interview scheduling (TODO)
- [ ] Ranked CEFR eligibility (server-side), manual override with note
- [ ] Hashed scheduling tokens with expiry
- [ ] Interview settings, availability, blocked dates, interviewers
- [ ] UTC appointments, anti-double-booking constraint, statuses
- [ ] Confirmation, reschedule/cancel, ICS + Google Calendar
- [ ] Dashboard appointment columns/filters
- [ ] Reminder job (cron) + `reminder_logs`, email now, WhatsApp disabled until configured
