insert into public.user_roles (user_id, role)
values ('37c352c0-a8c0-4549-b9f5-5642dcf00325', 'admin')
on conflict (user_id, role) do nothing;

insert into public.staff_profiles (user_id, full_name, email, active, must_change_password)
values ('37c352c0-a8c0-4549-b9f5-5642dcf00325', 'Kenia Castillo', 'keniacastillo9@gmail.com', true, false)
on conflict (user_id) do update set active = true, must_change_password = false, email = excluded.email;