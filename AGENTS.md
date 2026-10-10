<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Agreement PDFs are built in-app with pdf-lib from `src/lib/agreements/templates.data.ts` (extracted from the official Word files); why: no DOCX→PDF converter runs in the Worker and the user chose no external service.
- Emails with attachments go to Make with `route: "with_attachment"` + `attachment_url` (7-day signed URL, private `agreements` bucket); why: Make downloads and attaches the file, and mutually exclusive router filters prevent double sends.
- Candidate application videos have a hard one-minute limit in both the recorder and save validation; why: both required answers must remain concise.
- Manager stages enforce edit locking with their own disabled fieldsets; the read-only Recruitment disclosure stays outside that lock inside Reconfirmation so staff can consult completed interviews without enabling edits.
- Trainer-only and Generalista-only accounts are limited to Training Tracker in the route guard and server role checks; RLS accepts only full staff roles. Why: training access must not expose recruitment files.
- Training updates use separate server-enforced permissions for documents, reference calls and training fields; why: Generalistas and Recruitment have distinct responsibilities.
- Requisiciones en Training Tracker: spots NEEDED/BACKUP que se llenan al contratar (gestionadas por personal completo).
- All authenticated recruitment screens use the shared internal navigation rendered by StaffGate; why: navigation, active state, responsive behavior, and role visibility must stay consistent across direct loads and client navigation.
- Calendly sync stores one appointment per invitee (unique `calendly_invitee_uri`), matches applications by normalized email and creates minimal records when missing; staff-triggered syncs (auto every 5 min from Interviews, or the Sync Calendly button) never send emails or change the pipeline. Why: group events hold many candidates and bookings must not depend on webhooks or screening.
- "Interviews" (`/evaluations`) is the single interview screen (Today/Upcoming/Past/Unscheduled evaluations, appointment-based); `/interviews` is admin-only scheduling settings and redirects others. Why: avoid two competing interview views.
