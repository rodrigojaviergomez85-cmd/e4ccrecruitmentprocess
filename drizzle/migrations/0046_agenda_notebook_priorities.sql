CREATE TABLE public.recruiter_agenda_priorities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 agenda_date date NOT NULL,
 slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
 title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
 done boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (user_id, agenda_date, slot)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recruiter_agenda_priorities TO authenticated;
GRANT ALL ON public.recruiter_agenda_priorities TO service_role;
ALTER TABLE public.recruiter_agenda_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY agenda_priorities_read ON public.recruiter_agenda_priorities FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'recruitment'));
CREATE POLICY agenda_priorities_insert ON public.recruiter_agenda_priorities FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment')));
CREATE POLICY agenda_priorities_update ON public.recruiter_agenda_priorities FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment'))) WITH CHECK (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment')));
CREATE POLICY agenda_priorities_delete ON public.recruiter_agenda_priorities FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'recruitment')));
CREATE INDEX agenda_priorities_user_date ON public.recruiter_agenda_priorities(user_id,agenda_date);