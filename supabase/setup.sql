-- ============================================================================
--  HomeBase :: התקנה מלאה של הדאטהבייס
--  להדביק את כל הקובץ הזה ב-Supabase Dashboard -> SQL Editor -> New query
--  וללחוץ Run. הקובץ בטוח להרצה חוזרת (idempotent).
-- ============================================================================

-- ==================== 0001_schema.sql ====================
-- HomeBase :: 0001 schema
-- כל הסכומים נשמרים כמספרים שלמים באגורות (bigint) — אין שימוש ב-float.

create extension if not exists "pgcrypto";

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ── households ──────────────────────────────────────────────────────────────
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'ILS',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);
create index if not exists household_members_user_idx on public.household_members (user_id);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists household_invites_email_idx on public.household_invites (lower(email));

-- ── categories ──────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  icon text not null default 'pricetag',
  color text not null default '#2E9E6B',
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  sort_order int not null default 100,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists categories_household_idx on public.categories (household_id);

-- ── budgets (יעדים) ─────────────────────────────────────────────────────────
-- category_id = null  →  יעד כללי לחודש
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  month date not null, -- תמיד היום הראשון בחודש
  amount_agorot bigint not null check (amount_agorot >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists budgets_unique_category_idx
  on public.budgets (household_id, month, category_id) where category_id is not null;
create unique index if not exists budgets_unique_overall_idx
  on public.budgets (household_id, month) where category_id is null;

-- ── recurring rules (הוצאות/הכנסות קבועות) ─────────────────────────────────
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  title text not null,
  amount_agorot bigint not null check (amount_agorot > 0),
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  is_active boolean not null default true,
  last_run_month date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists recurring_rules_household_idx on public.recurring_rules (household_id);

-- ── transactions ────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  amount_agorot bigint not null check (amount_agorot > 0),
  occurred_on date not null default current_date,
  note text,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists transactions_household_date_idx
  on public.transactions (household_id, occurred_on desc);

-- עמודה מחושבת לחודש התנועה. משתמשים ב-::timestamp במפורש כי
-- date_trunc(text, timestamptz) היא STABLE בלבד (תלויה ב-TimeZone) ולכן
-- אסורה בביטוי אינדקס / generated column, בעוד date_trunc(text, timestamp) היא IMMUTABLE.
alter table public.transactions
  add column if not exists period_month date
  generated always as ((date_trunc('month', occurred_on::timestamp))::date) stored;

-- מונע רישום כפול של אותה הוצאה קבועה באותו חודש
create unique index if not exists transactions_recurring_month_idx
  on public.transactions (recurring_rule_id, period_month)
  where recurring_rule_id is not null;


-- ==================== 0002_rls.sql ====================
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

-- אין policy ל-INSERT בכוונה: הצטרפות למשק בית מתבצעת אך ורק דרך
-- create_household() או accept_invite() שהן security definer, כדי שמשתמש
-- לא יוכל לצרף את עצמו למשק בית זר.
drop policy if exists household_members_insert on public.household_members;

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


-- ==================== 0003_functions.sql ====================
-- HomeBase :: 0003 פונקציות RPC (יצירת משק בית, seed קטגוריות, הזמנות, גלגול יעדים, קבועות)

-- ── seed קטגוריות בעברית ────────────────────────────────────────────────────
create or replace function public.seed_default_categories(hid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (household_id, name, icon, color, kind, sort_order)
  values
    (hid, 'סופר ומכולת',     'cart',              '#2E9E6B', 'expense', 10),
    (hid, 'מסעדות וקפה',     'restaurant',        '#E4894F', 'expense', 20),
    (hid, 'דיור ושכירות',    'home',              '#4F7FE4', 'expense', 30),
    (hid, 'חשבונות בית',     'flash',             '#F2C14E', 'expense', 40),
    (hid, 'תחבורה ודלק',     'car',               '#5BC0BE', 'expense', 50),
    (hid, 'בריאות ותרופות',  'medkit',            '#E4646C', 'expense', 60),
    (hid, 'ילדים וחינוך',    'happy',             '#9B6BDF', 'expense', 70),
    (hid, 'ביגוד והנעלה',    'shirt',             '#DE7AA8', 'expense', 80),
    (hid, 'פנאי ובילויים',   'game-controller',   '#3FA7D6', 'expense', 90),
    (hid, 'מנויים ודיגיטל',  'phone-portrait',    '#7A8B99', 'expense', 100),
    (hid, 'ביטוח',           'shield-checkmark',  '#6B8E7B', 'expense', 110),
    (hid, 'מתנות ותרומות',   'gift',              '#C2557A', 'expense', 120),
    (hid, 'חיות מחמד',       'paw',               '#A9743F', 'expense', 130),
    (hid, 'חיסכון והשקעות',  'trending-up',       '#2F8F5B', 'expense', 140),
    (hid, 'שונות',           'ellipsis-horizontal','#8A94A6','expense', 200),
    (hid, 'משכורת',          'briefcase',         '#2E9E6B', 'income',  10),
    (hid, 'עסק עצמאי',       'business',          '#4F7FE4', 'income',  20),
    (hid, 'קצבאות',          'wallet',            '#F2C14E', 'income',  30),
    (hid, 'הכנסה אחרת',      'add-circle',        '#8A94A6', 'income',  40)
  on conflict do nothing;
end;
$$;

-- ── יצירת משק בית חדש (+ חברות owner + seed) ───────────────────────────────
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'משק הבית שלי'), uid)
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, uid, 'owner');

  perform public.seed_default_categories(hid);

  -- כל הזמנה ממתינה לכתובת המייל הזו במשק בית אחר נשארת כפי שהיא
  return hid;
end;
$$;

-- ── הזמנות ─────────────────────────────────────────────────────────────────
create or replace function public.invite_to_household(p_household_id uuid, p_email text)
returns public.household_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  update public.household_invites
     set status = 'revoked'
   where household_id = p_household_id
     and lower(email) = lower(trim(p_email))
     and status = 'pending';

  insert into public.household_invites (household_id, email, invited_by)
  values (p_household_id, lower(trim(p_email)), auth.uid())
  returning * into inv;

  return inv;
end;
$$;

-- הזמנות ממתינות עבור המשתמש המחובר (לפי המייל שלו)
create or replace function public.my_pending_invites()
returns table (
  invite_id uuid,
  household_id uuid,
  household_name text,
  invited_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.household_id, h.name, p.full_name, i.created_at
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.status = 'pending'
    and i.expires_at > now()
    and lower(i.email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and not exists (
      select 1 from public.household_members m
      where m.household_id = i.household_id and m.user_id = auth.uid()
    );
$$;

create or replace function public.accept_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites;
  my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();

  select * into inv from public.household_invites
   where id = p_invite_id and status = 'pending' and expires_at > now();

  if inv.id is null then
    raise exception 'ההזמנה אינה תקפה';
  end if;

  if lower(inv.email) <> lower(coalesce(my_email, '')) then
    raise exception 'ההזמנה אינה מיועדת לכתובת המייל שלך';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  update public.household_invites set status = 'accepted' where id = inv.id;

  return inv.household_id;
end;
$$;

-- ── גלגול יעדים אוטומטי לחודש הנוכחי ───────────────────────────────────────
create or replace function public.rollover_budgets(p_household_id uuid, p_month date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_month)::date;
  prev date := (date_trunc('month', p_month) - interval '1 month')::date;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  if exists (select 1 from public.budgets where household_id = p_household_id and month = m) then
    return;
  end if;

  insert into public.budgets (household_id, category_id, month, amount_agorot)
  select household_id, category_id, m, amount_agorot
  from public.budgets
  where household_id = p_household_id and month = prev;
end;
$$;

-- ── הרצת הוצאות/הכנסות קבועות לחודש הנוכחי ─────────────────────────────────
create or replace function public.apply_recurring(p_household_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recurring_rules;
  m date := date_trunc('month', current_date)::date;
  target date;
  inserted int := 0;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  for r in
    select * from public.recurring_rules
    where household_id = p_household_id
      and is_active
      and (last_run_month is null or last_run_month < m)
  loop
    -- מצמידים את היום לחודש (למשל 31 בפברואר → סוף פברואר)
    target := least(
      m + (r.day_of_month - 1),
      (m + interval '1 month - 1 day')::date
    );

    if target <= current_date then
      insert into public.transactions
        (household_id, user_id, category_id, kind, amount_agorot, occurred_on, note, recurring_rule_id)
      values
        (r.household_id, r.created_by, r.category_id, r.kind, r.amount_agorot, target, r.title, r.id)
      on conflict do nothing;

      update public.recurring_rules set last_run_month = m where id = r.id;
      inserted := inserted + 1;
    end if;
  end loop;

  return inserted;
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.seed_default_categories(uuid) to authenticated;
grant execute on function public.invite_to_household(uuid, text) to authenticated;
grant execute on function public.my_pending_invites() to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.rollover_budgets(uuid, date) to authenticated;
grant execute on function public.apply_recurring(uuid) to authenticated;

-- =====================================================================
-- 0004: profiles embedding
-- =====================================================================

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
