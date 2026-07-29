-- 0004: make `profiles` embeddable from transactions and household_members.
--
-- Both tables' user_id columns reference auth.users(id). PostgREST only
-- follows foreign keys whose target lives in an exposed schema, so
-- `select('*, profiles(...)')` failed at runtime with:
--   "Could not find a relationship between 'transactions' and 'profiles'"
-- profiles.id *is* auth.users.id, so a parallel FK to public.profiles is
-- redundant data-wise but gives PostgREST a relationship it can resolve.

-- Backfill so the new constraints can be validated against existing rows.
insert into public.profiles (id, email, full_name)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_user_id_profiles_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_user_id_profiles_fkey
      foreign key (user_id) references public.profiles (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'household_members_user_id_profiles_fkey'
      and conrelid = 'public.household_members'::regclass
  ) then
    alter table public.household_members
      add constraint household_members_user_id_profiles_fkey
      foreign key (user_id) references public.profiles (id) on delete cascade;
  end if;
end $$;
