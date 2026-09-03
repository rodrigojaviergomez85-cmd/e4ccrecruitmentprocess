create or replace function public.bootstrap_owner_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and lower(new.email) = 'kennia.vasquez@e4ccglobal.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;

    insert into public.staff_profiles (user_id, full_name, email, active, must_change_password)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Kennia Vasquez'), new.email, true, false)
    on conflict (user_id) do update set active = true, email = excluded.email;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bootstrap_owner on auth.users;
create trigger on_auth_user_created_bootstrap_owner
after insert on auth.users
for each row execute function public.bootstrap_owner_account();

drop trigger if exists on_auth_user_confirmed_bootstrap_owner on auth.users;
create trigger on_auth_user_confirmed_bootstrap_owner
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.bootstrap_owner_account();