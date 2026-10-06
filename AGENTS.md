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
- Trainer-only accounts sign in but are limited to the Training Tracker: `staffTier().isStaff` excludes them and `private.is_active_staff` ignores the trainer role; why: trainers must not inherit broad staff/RLS read access.
