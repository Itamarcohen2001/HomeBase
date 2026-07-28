-- HomeBase :: 0002 פונקציות עזר, RLS ופוליסי

-- ── security definer helpers (מונעים רקורסיה אינסופית ב-RLS) ───────────────
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id from public.household_members m where m.user_id = auth.uid();
$$;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.my_household_ids() to authenticated;

-- ── יצירת פרופיל אוטומטית לכל משתמש חדש ────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.households         enable row level security;
alter table public.household_members  enable row level security;
alter table public.household_invites  enable row level security;
alter table public.categories         enable row level security;
alter table public.budgets            enable row level security;
alter table public.recurring_rules    enable row level security;
alter table public.transactions       enable row level security;

-- profiles: כל אחד רואה את עצמו, ואת חברי משק הבית שלו
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.household_members m
    where m.user_id = public.profiles.id
      and public.is_household_member(m.household_id)
  )
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
with check (id = auth.uid());

-- households
drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated
using (public.is_household_member(id));

drop policy if exists households_insert on public.households;
create policy households_insert on public.households for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists households_update on public.households;
create policy households_update on public.households for update to authenticated
using (public.is_household_owner(id)) with check (public.is_household_owner(id));

drop policy if exists households_delete on public.households;
create policy households_delete on public.households for delete to authenticated
using (public.is_household_owner(id));

-- household_members  (שימוש ב-security definer כדי למנוע רקורסיה)
drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members for select to authenticated
using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists household_members_insert on public.household_members;
create policy household_members_insert on public.household_members for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members for delete to authenticated
using (user_id = auth.uid() or public.is_household_owner(household_id));

-- household_invites
drop policy if exists household_invites_select on public.household_invites;
create policy household_invites_select on public.household_invites for select to authenticated
using (
  public.is_household_member(household_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists household_invites_insert on public.household_invites;
create policy household_invites_insert on public.household_invites for insert to authenticated
with check (public.is_household_member(household_id) and invited_by = auth.uid());

drop policy if exists household_invites_update on public.household_invites;
create policy household_invites_update on public.household_invites for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists household_invites_delete on public.household_invites;
create policy household_invites_delete on public.household_invites for delete to authenticated
using (public.is_household_member(household_id));

-- טבלאות תוכן — אותה תבנית לכולן
do $$
declare t text;
begin
  foreach t in array array['categories', 'budgets', 'recurring_rules', 'transactions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_household_member(household_id))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_household_member(household_id))',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_household_member(household_id))',
      t || '_delete', t);
  end loop;
end;
$$;
