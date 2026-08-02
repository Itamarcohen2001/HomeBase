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
  -- תנועת הון: הכסף עובר בין חשבונות ולא נצרך. מקטין את צפי העו"ש, לא את ההון.
  -- 🔴 הקוד בודק את הדגל ולא את שם הקטגוריה — המשתמש יכול לשנות שם.
  is_capital_move boolean not null default false,
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
as$
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
  insert into public.categories (household_id, name, icon, color, kind, sort_order, is_capital_move)
  values
    (hid, 'סופר ומכולת',     'cart',              '#2E9E6B', 'expense', 10,  false),
    (hid, 'מסעדות וקפה',     'restaurant',        '#E4894F', 'expense', 20,  false),
    (hid, 'דיור ושכירות',    'home',              '#4F7FE4', 'expense', 30,  false),
    (hid, 'חשבונות בית',     'flash',             '#F2C14E', 'expense', 40,  false),
    (hid, 'תחבורה ודלק',     'car',               '#5BC0BE', 'expense', 50,  false),
    (hid, 'בריאות ותרופות',  'medkit',            '#E4646C', 'expense', 60,  false),
    (hid, 'ילדים וחינוך',    'happy',             '#9B6BDF', 'expense', 70,  false),
    (hid, 'ביגוד והנעלה',    'shirt',             '#DE7AA8', 'expense', 80,  false),
    (hid, 'פנאי ובילויים',   'game-controller',   '#3FA7D6', 'expense', 90,  false),
    (hid, 'מנויים ודיגיטל',  'phone-portrait',    '#7A8B99', 'expense', 100, false),
    (hid, 'ביטוח',           'shield-checkmark',  '#6B8E7B', 'expense', 110, false),
    (hid, 'מתנות ותרומות',   'gift',              '#C2557A', 'expense', 120, false),
    (hid, 'חיות מחמד',       'paw',               '#A9743F', 'expense', 130, false),
    (hid, 'חיסכון והשקעות',  'trending-up',       '#2F8F5B', 'expense', 140, false),
    (hid, 'העברות כספים',    'swap-horizontal',   '#7A6BDF', 'expense', 150, false),
    (hid, 'העברה להשקעות',   'trending-up',       '#3F6BA9', 'expense', 160, true),
    (hid, 'שונות',           'ellipsis-horizontal','#8A94A6','expense', 200, false),
    (hid, 'משכורת',          'briefcase',         '#2E9E6B', 'income',  10,  false),
    (hid, 'עסק עצמאי',       'business',          '#4F7FE4', 'income',  20,  false),
    (hid, 'קצבאות',          'wallet',            '#F2C14E', 'income',  30,  false),
    (hid, 'הכנסה אחרת',      'add-circle',        '#8A94A6', 'income',  40,  false)
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

-- ==================== 0005_shared_expenses.sql ====================
-- 0005: סימון "הוצאה משותפת" על תנועה.
--
-- הוצאה משותפת = הוצאה של כל משק הבית (קניות, חשמל, שכר דירה). בגרף הפיצול
-- בין בני הבית היא מקבלת פרוסה נפרדת בשם "משותף" ואינה נזקפת לאף אדם.
-- `user_id` (מי הזין את התנועה) ממשיך להישמר ולהיות מוצג כרגיל — הסימון
-- משפיע רק על אופן הצגת הפיצול, לא על תיעוד מי רשם.
--
-- אין צורך בשינוי RLS: הפוליסות של transactions נשענות על household_id בלבד
-- (ראה 0002_rls.sql), ולכן עמודה חדשה נכללת בהן אוטומטית.

alter table public.transactions
  add column if not exists is_shared boolean not null default false;

comment on column public.transactions.is_shared is
  'הוצאה של כל משק הבית — מוצגת כפרוסת "משותף" ולא נזקפת לאדם מסוים';

-- שאילתות הניתוח מסננות לפי משק בית + חודש ואז מקבצות לפי is_shared/user_id.
create index if not exists transactions_household_month_shared_idx
  on public.transactions (household_id, period_month, is_shared);

-- ==================== 0006_import_rules.sql ====================
-- 0006: ייבוא דוחות בנק / כרטיס אשראי.
--
-- הטבלה שומרת את הכללים שהמשתמש לימד את המערכת במסך האישור:
-- "כל תנועה שהתיאור שלה מכיל <תבנית> שייכת לקטגוריה <X>".
-- הכללים הם לפי משק בית, כדי ששני בני הבית יראו את אותו קטלוג.
--
-- זיהוי כפילויות לא דורש עמודה חדשה: החתימה היא
-- (תאריך + סכום + תיאור מנורמל), ואנחנו סופרים מופעים ולא עושים distinct,
-- כי שתי עסקאות זהות באותו יום הן מקרה אמיתי (למשל שני תשלומי PAYBOX של 40).

create table if not exists public.import_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- התיאור המנורמל של בית העסק (אותיות קטנות, רווחים מכווצים)
  pattern text not null,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, pattern)
);

create index if not exists import_rules_household_idx
  on public.import_rules (household_id);

comment on table public.import_rules is
  'כללי קטלוג נלמדים לייבוא מהבנק — תבנית תיאור → קטגוריה, לפי משק בית';

alter table public.import_rules enable row level security;

-- אותה תבנית פוליסי כמו שאר טבלאות התוכן (ראה 0002_rls.sql)
drop policy if exists import_rules_select on public.import_rules;
create policy import_rules_select on public.import_rules for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists import_rules_insert on public.import_rules;
create policy import_rules_insert on public.import_rules for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists import_rules_update on public.import_rules;
create policy import_rules_update on public.import_rules for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists import_rules_delete on public.import_rules;
create policy import_rules_delete on public.import_rules for delete to authenticated
using (public.is_household_member(household_id));

-- ==================== 0007_recurring_shared.sql ====================
-- 0007 — הוצאה קבועה משותפת
--
-- ⚠️ הסדר קריטי: ה-alter חייב לרוץ לפני ה-create or replace, אחרת
-- `r.is_shared` לא קיים ברשומת הכלל והפונקציה לא תתקמפל.
--
-- 🔴 הנקודה שקל לפספס: לא מספיק להוסיף את העמודה לטבלה ואת התיבה לממשק.
-- `apply_recurring` היא זו שיוצרת בפועל את התנועה בכל חודש, ובלי לעדכן
-- אותה כל תנועה אוטומטית הייתה נכנסת עם is_shared=false — הפיצ'ר היה
-- נראה תקין היום ונשבר בשקט בחודש הבא.

alter table public.recurring_rules
  add column if not exists is_shared boolean not null default false;

comment on column public.recurring_rules.is_shared is
  'הוצאה קבועה משותפת — כל תנועה שתיווצר ממנה תסומן אוטומטית כמשותפת';

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
    target := least(
      m + (r.day_of_month - 1),
      (m + interval '1 month - 1 day')::date
    );

    if target <= current_date then
      insert into public.transactions
        (household_id, user_id, category_id, kind, amount_agorot, occurred_on, note, recurring_rule_id, is_shared)
      values
        (r.household_id, r.created_by, r.category_id, r.kind, r.amount_agorot, target, r.title, r.id, r.is_shared)
      on conflict do nothing;

      update public.recurring_rules set last_run_month = m where id = r.id;
      inserted := inserted + 1;
    end if;
  end loop;

  return inserted;
end;
$$;

grant execute on function public.apply_recurring(uuid) to authenticated;

-- ==================== 0010_net_worth.sql ====================
-- 0010: שווי נטו — חשבונות, אחזקות, ומחירי שוק.
--
-- המסך מציג כמה כסף יש למשק הבית בסך הכול: בנק + בתי השקעות + מזומן,
-- כששווי ההשקעות מתעדכן ממחירי שוק אמיתיים ולא מהסכום שהיה בדוח.
--
-- שלוש החלטות מבניות שנמדדו מול הקבצים האמיתיים ואסור לשנות בלי מדידה חדשה:
--
--   1. `holdings` מפתחת ב-(חשבון, נייר, תאריך) ולא ב-(נייר, תאריך).
--      אותו נייר מוחזק בשני חשבונות בו-זמנית בקבצים האמיתיים.
--
--   2. `balance_agorot` הוא bigint **חתום, בלי check (> 0)**.
--      נמדדה יתרת עו"ש שלילית. זה שונה מ-`transactions.amount_agorot`
--      שם החיוב `> 0` נכון, כי שם הכיוון נשמר ב-`kind`.
--
--   3. `ils_price_agorot` מחושב ב-Edge Function ונכתב מוכן, **לא ב-view**.
--      גרסה שחילקה את השער ב-`unit_divisor` בתוך ה-view שגויה לניירות
--      דולריים — שם נדרשת המרת מט"ח, לא חלוקה. נורמליזציה בנקודה אחת.
--
-- אין פרטיות: הכול משותף ברמת משק הבית. אין `is_private` ואין RLS נפרד.

-- ── חשבונות ────────────────────────────────────────────────────────────────
-- `balance_agorot` הוא היתרה המוצהרת: בבנק/מזומן זו כל היתרה, בבית השקעות
-- זו יתרת המזומן בלבד (ניירות יושבים ב-`holdings`).
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null default 'bank' check (kind in ('bank', 'brokerage', 'cash')),
  institution text,
  -- מספר החשבון כפי שהוא בדוחות הבנק. משמש לשיוך חיובים לחשבון הנכון בלבד.
  -- 🔴 התאמת חיובים חייבת להיות מוגבלת לאותו בנק: כרטיס אשראי בבנק אחד
  --    לעולם לא יופיע בדוח עו"ש של בנק אחר, והתאמה גלובלית הייתה מסמנת
  --    אותו «טרם ירד» לצמיתות ומציגה צפי שגוי בקביעות, בלי שום שגיאה.
  external_ref text,
  currency text not null default 'ILS',
  -- חתום בכוונה — ראה הערה 2 למעלה
  balance_agorot bigint not null default 0,
  -- מאיזה רגע היתרה. ממנו נגזר החיווי "עודכן לפני N ימים".
  captured_at timestamptz not null default now(),
  is_archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists accounts_household_idx
  on public.accounts (household_id) where is_archived = false;

comment on table public.accounts is
  'חשבונות משק הבית לחישוב שווי נטו — בנק, בית השקעות, מזומן';
comment on column public.accounts.balance_agorot is
  'יתרה באגורות, חתומה. עו"ש יכול להיות שלילי — אין check (> 0).';

-- ── קטלוג ניירות ───────────────────────────────────────────────────────────
-- טבלה **גלובלית**, לא לפי משק בית: זהו מידע שוק ציבורי (למעלה מ-11,000
-- ניירות), ואין שום היגיון לשכפל אותו לכל משק בית. לכן ה-RLS כאן שונה:
-- קריאה לכל משתמש מחובר, כתיבה רק ל-service_role (ה-Edge Function).
--
-- 🪤 `price_feed` הוא הדבר שקובע לאיזו נקודת קצה פונים, והוא **חייב** להיקבע
--    מסוג הנייר בקטלוג — לא מניסיון-ונפילה. נמדד: נקודת הקצה של הסחירים
--    מחזירה 200 עם גוף ריק לקרנות נאמנות **וגם למספרי נייר מומצאים**,
--    ולכן "נסה סחיר, אם 404 נפול לקרן" לא ייפול לעולם וכל הקרנות יישארו
--    בלי מחיר בשקט. הכיוון ההפוך כן מחזיר 404, אבל אי אפשר להסתמך על צד אחד.
create table if not exists public.securities (
  id uuid primary key default gen_random_uuid(),
  -- מספר נייר בבורסה בת"א, או סימול זר (למשל QQQ), או צמד מט"ח (USDILS=X)
  external_id text not null,
  price_feed text not null check (price_feed in ('tase_security', 'tase_fund', 'yahoo')),
  name text not null,
  symbol text,
  isin text,
  -- המטבע שבו הפיד מצטט. ת"א מצטטת ב-ILA (אגורות).
  quote_currency text not null default 'ILA',
  -- סיווג לגרף ההתפלגות. נקבע אוטומטית מהקטלוג וניתן לעריכה ידנית.
  -- 🎯 הסיווג יושב על **הנייר** ולא על החשבון: חשבון בנק אחד מחזיק גם
  --    יתרת עו"ש וגם קרן כספית, וגזירה מ-`accounts.kind` הייתה מציגה את
  --    הקרן כ«עו"ש» בשקט, בלי שום שגיאה.
  asset_class text not null default 'equity'
    check (asset_class in ('equity', 'money_market', 'bond', 'cash', 'other')),
  created_at timestamptz not null default now(),
  unique (external_id, price_feed)
);

create index if not exists securities_external_idx on public.securities (external_id);

comment on table public.securities is
  'קטלוג ניירות ערך — גלובלי, לא לפי משק בית. קריאה לכולם, כתיבה רק לשרת.';
comment on column public.securities.price_feed is
  'נקודת הקצה לתמחור. נקבע מסוג הנייר בקטלוג — נקודת הקצה של הסחירים מחזירה 200 ריק על קרנות, ולכן נפילה-אחורה לפי סטטוס לא עובדת.';

-- ── מחירי שוק ──────────────────────────────────────────────────────────────
-- גלובלית כמו `securities`. `ils_price_agorot` כבר מנורמל לשקלים —
-- ה-Edge Function מבצע גם את חלוקת האגורות וגם את המרת המט"ח.
create table if not exists public.security_prices (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.securities (id) on delete cascade,
  price_date date not null,
  -- השער כפי שהפיד מסר אותו, לפני נורמליזציה. נשמר לצורך ביקורת.
  stated_rate numeric not null,
  stated_currency text not null,
  -- אחרי נורמליזציה: מחיר יחידה אחת בשקלים, באגורות.
  ils_price_agorot bigint not null,
  fetched_at timestamptz not null default now(),
  unique (security_id, price_date)
);

create index if not exists security_prices_latest_idx
  on public.security_prices (security_id, price_date desc);

comment on column public.security_prices.ils_price_agorot is
  'מחיר יחידה בשקלים (אגורות) אחרי חלוקת ILA/GBp והמרת מט"ח. מחושב ב-Edge Function.';

-- ── שערי חליפין ────────────────────────────────────────────────────────────
create table if not exists public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  quote_currency text not null default 'ILS',
  rate_date date not null,
  rate numeric not null check (rate > 0),
  fetched_at timestamptz not null default now(),
  unique (base_currency, quote_currency, rate_date)
);

create index if not exists fx_rates_latest_idx
  on public.fx_rates (base_currency, quote_currency, rate_date desc);

-- ── אחזקות ─────────────────────────────────────────────────────────────────
-- 🪤 המפתח הוא (חשבון, נייר, תאריך) ולא (נייר, תאריך) — ראה הערה 1.
--
-- `stated_value_agorot` הוא השווי שהיה בדוח ביום ההורדה. **המחיר החי גובר
-- עליו** — זה הפיצ'ר עצמו. הוא נשמר רק כנפילה-אחורה, וכשאין מחיר וגם אין
-- שווי מוצהר ה-view מצהיר על כך במקום להציג מספר שקרי בשקט.
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  security_id uuid not null references public.securities (id) on delete restrict,
  as_of date not null default current_date,
  quantity numeric not null,
  stated_value_agorot bigint,
  -- "אחוז אחזקה" מהדוח. סכום שאינו 100% מסגיר שהייצוא חלקי,
  -- ואנחנו מציגים את הפער למשתמש במקום מספר יפה ושקרי.
  stated_share_pct numeric,
  created_at timestamptz not null default now(),
  unique (account_id, security_id, as_of)
);

create index if not exists holdings_household_idx on public.holdings (household_id);
create index if not exists holdings_account_idx on public.holdings (account_id, as_of desc);

comment on table public.holdings is
  'אחזקות ניירות ערך לפי חשבון ותאריך. אותו נייר יכול להיות בשני חשבונות בו-זמנית.';

-- ── תצלומי שווי ────────────────────────────────────────────────────────────
-- v1 מציג שווי נוכחי בלבד בלי גרף, אבל התצלום נכתב בכל מקרה
-- כדי שגרף עתידי לא ידרוש מיגרציה נוספת.
create table if not exists public.account_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  captured_on date not null default current_date,
  -- חתום, כמו `accounts.balance_agorot`
  total_agorot bigint not null,
  unique (account_id, captured_on)
);

create index if not exists account_snapshots_household_idx
  on public.account_snapshots (household_id, captured_on desc);

-- ── RLS: טבלאות משק בית ────────────────────────────────────────────────────
-- אותה תבנית פוליסי כמו שאר טבלאות התוכן (ראה 0002_rls.sql)
alter table public.accounts enable row level security;

drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts for delete to authenticated
using (public.is_household_member(household_id));

alter table public.holdings enable row level security;

drop policy if exists holdings_select on public.holdings;
create policy holdings_select on public.holdings for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists holdings_insert on public.holdings;
create policy holdings_insert on public.holdings for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists holdings_update on public.holdings;
create policy holdings_update on public.holdings for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists holdings_delete on public.holdings;
create policy holdings_delete on public.holdings for delete to authenticated
using (public.is_household_member(household_id));

alter table public.account_snapshots enable row level security;

drop policy if exists account_snapshots_select on public.account_snapshots;
create policy account_snapshots_select on public.account_snapshots for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists account_snapshots_insert on public.account_snapshots;
create policy account_snapshots_insert on public.account_snapshots for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists account_snapshots_update on public.account_snapshots;
create policy account_snapshots_update on public.account_snapshots for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists account_snapshots_delete on public.account_snapshots;
create policy account_snapshots_delete on public.account_snapshots for delete to authenticated
using (public.is_household_member(household_id));

-- ── RLS: מידע שוק גלובלי ───────────────────────────────────────────────────
-- מידע ציבורי. קריאה לכל משתמש מחובר; אין פוליסי כתיבה, ולכן רק
-- service_role (שעוקף RLS) יכול לכתוב — כלומר ה-Edge Function בלבד.
alter table public.securities enable row level security;

drop policy if exists securities_select on public.securities;
create policy securities_select on public.securities for select to authenticated
using (true);

alter table public.security_prices enable row level security;

drop policy if exists security_prices_select on public.security_prices;
create policy security_prices_select on public.security_prices for select to authenticated
using (true);

alter table public.fx_rates enable row level security;

drop policy if exists fx_rates_select on public.fx_rates;
create policy fx_rates_select on public.fx_rates for select to authenticated
using (true);

-- ── תצוגת שווי נטו לפי חשבון ───────────────────────────────────────────────
-- ה-view **לא** מנרמל מחירים — הוא רק מכפיל כמות במחיר שכבר מוכן.
-- `security_invoker` מכריח את ה-view לרוץ תחת ההרשאות של הקורא, ולכן
-- ה-RLS של `holdings` חל. בלעדיו ה-view היה רץ תחת הבעלים ודולף בין
-- משקי בית — זה הכשל המסוכן ביותר כאן.
create or replace view public.net_worth_by_account
with (security_invoker = on) as
with latest_holdings as (
  select distinct on (h.account_id, h.security_id)
    h.household_id, h.account_id, h.security_id, h.quantity,
    h.stated_value_agorot, h.as_of
  from public.holdings h
  order by h.account_id, h.security_id, h.as_of desc
),
latest_prices as (
  select distinct on (p.security_id)
    p.security_id, p.ils_price_agorot, p.price_date
  from public.security_prices p
  order by p.security_id, p.price_date desc
),
valued as (
  select
    lh.household_id,
    lh.account_id,
    case
      when lp.ils_price_agorot is not null
        then round(lh.quantity * lp.ils_price_agorot)::bigint
      else lh.stated_value_agorot
    end as value_agorot,
    (lp.ils_price_agorot is null and lh.stated_value_agorot is null) as is_unpriced,
    (lp.ils_price_agorot is null and lh.stated_value_agorot is not null) as is_stale_from_report
  from latest_holdings lh
  left join latest_prices lp on lp.security_id = lh.security_id
)
select
  a.id as account_id,
  a.household_id,
  a.name,
  a.kind,
  a.balance_agorot,
  a.captured_at,
  coalesce(sum(v.value_agorot), 0)::bigint as holdings_agorot,
  (a.balance_agorot + coalesce(sum(v.value_agorot), 0))::bigint as total_agorot,
  coalesce(count(*) filter (where v.is_unpriced), 0)::int as unpriced_holdings,
  coalesce(count(*) filter (where v.is_stale_from_report), 0)::int as report_valued_holdings
from public.accounts a
left join valued v on v.account_id = a.id
where a.is_archived = false
group by a.id, a.household_id, a.name, a.kind, a.balance_agorot, a.captured_at;

comment on view public.net_worth_by_account is
  'שווי נטו לפי חשבון. `unpriced_holdings` מצהיר על אחזקות בלי מחיר וגם בלי שווי בדוח — המסך מסמן "הסכום חסר" במקום להציג מספר שקרי.';

-- ── 5. כיס הממתינים לשיוך ──────────────────────────────────────────────────
-- כסף שיצא מהעו"ש כתנועת הון אבל עוד לא הופיע כאחזקה. פרוסה אפורה בגרף,
-- **רק כשהסכום גדול מאפס**, וגם רשימת מטלות: «3,000 ₪ מחכים לשיוך».
--
-- `transaction_id` הוא המפתח: הכיס נגזר מתנועה אמיתית ולא מהזנה חופשית,
-- ומחיקת התנועה מנקה אותו. `unique` מונע ספירה כפולה של אותה תנועה.
create table if not exists public.pending_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  -- חיובי תמיד: זהו סכום שיצא ומחכה. הכיוון קבוע ואינו נשמר.
  amount_agorot bigint not null check (amount_agorot > 0),
  -- לאיזה חשבון הכסף אמור להגיע, אם ידוע
  account_id uuid references public.accounts (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (transaction_id)
);

create index if not exists pending_allocations_open_idx
  on public.pending_allocations (household_id) where resolved_at is null;

comment on table public.pending_allocations is
  'כסף שיצא מהעו"ש כתנועת הון ועוד לא הופיע כאחזקה. בלעדיו הסכום מתאדה מההון.';

alter table public.pending_allocations enable row level security;

drop policy if exists pending_allocations_select on public.pending_allocations;
create policy pending_allocations_select on public.pending_allocations for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists pending_allocations_insert on public.pending_allocations;
create policy pending_allocations_insert on public.pending_allocations for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists pending_allocations_update on public.pending_allocations;
create policy pending_allocations_update on public.pending_allocations for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists pending_allocations_delete on public.pending_allocations;
create policy pending_allocations_delete on public.pending_allocations for delete to authenticated
using (public.is_household_member(household_id));

-- ── 6. התפלגות הנכסים ──────────────────────────────────────────────────────
-- מקור הנתונים של גרף העוגה. **שורה אחת לכל מחלקת נכס**, לא לכל חשבון —
-- ובדיוק בשל כך היא נגזרת מ-`securities.asset_class` לניירות ומ-
-- `accounts.kind` רק ליתרות המזומן שאין להן נייר.
--
-- `security_invoker` חובה, אחרת ה-view רץ תחת הבעלים ודולף בין משקי בית.
create or replace view public.net_worth_by_asset_class
with (security_invoker = on) as
with latest_holdings as (
  select distinct on (h.account_id, h.security_id)
    h.household_id, h.account_id, h.security_id, h.quantity,
    h.stated_value_agorot, h.as_of
  from public.holdings h
  order by h.account_id, h.security_id, h.as_of desc
),
latest_prices as (
  select distinct on (p.security_id)
    p.security_id, p.ils_price_agorot, p.price_date
  from public.security_prices p
  order by p.security_id, p.price_date desc
),
-- ניירות: המחלקה מגיעה מהנייר עצמו
-- 🔴 אחזקה בלי מחיר **וגם** בלי שווי בדוח היא **סכום חסר, לא אפס** (NW-15).
--    ב-view הראשי זה כבר נספר כ-`unpriced_holdings`; כאן זה חמור יותר,
--    כי פאי **מנרמל**: פרוסה שנבלעה ב-0 גורמת לכל השאר להציג 100.0%
--    על בסיס שגוי, בלי שום סימן. לכן היא נספרת ומדווחת החוצה.
from_holdings as (
  select
    lh.household_id,
    s.asset_class,
    coalesce(
      case
        when lp.ils_price_agorot is not null
          then round(lh.quantity * lp.ils_price_agorot)::bigint
        else lh.stated_value_agorot
      end,
      0
    )::bigint as value_agorot,
    case
      when lp.ils_price_agorot is null and lh.stated_value_agorot is null then 1
      else 0
    end as unpriced
  from latest_holdings lh
  join public.securities s on s.id = lh.security_id
  left join latest_prices lp on lp.security_id = lh.security_id
),
-- יתרות: אין להן נייר, ולכן המחלקה מגיעה מסוג החשבון.
-- 🪤 בבית השקעות זו יתרת המזומן בלבד — הניירות כבר נספרו למעלה.
from_balances as (
  select
    a.household_id,
    case when a.kind = 'bank' then 'checking' else 'cash' end as asset_class,
    a.balance_agorot as value_agorot,
    0 as unpriced
  from public.accounts a
  where a.is_archived = false and a.balance_agorot <> 0
),
-- הכיס: פרוסה נפרדת, ומופיעה רק כשיש בה משהו
from_pending as (
  select
    p.household_id,
    'pending' as asset_class,
    sum(p.amount_agorot)::bigint as value_agorot,
    0 as unpriced
  from public.pending_allocations p
  where p.resolved_at is null
  group by p.household_id
)
select
  household_id,
  asset_class,
  sum(value_agorot)::bigint as value_agorot,
  sum(unpriced)::bigint as unpriced_count
from (
  select household_id, asset_class, value_agorot, unpriced from from_holdings
  union all
  select household_id, asset_class, value_agorot, unpriced from from_balances
  union all
  select household_id, asset_class, value_agorot, unpriced from from_pending
) all_sources
group by household_id, asset_class
-- 🔴 מחלקה שכל אחזקותיה חסרות מחיר מסתכמת ב-0. `<> 0` לבדו היה **מעלים
--    אותה לגמרי** — בדיוק הפער שהיא אמורה להצהיר עליו.
having sum(value_agorot) <> 0 or sum(unpriced) > 0;

comment on view public.net_worth_by_asset_class is
  'התפלגות ההון לפי מחלקת נכס. ניירות לפי securities.asset_class, יתרות לפי accounts.kind, והכיס כפרוסה נפרדת. unpriced_count מצהיר אחזקות בלי מחיר ובלי שווי — הן תורמות 0 ולכן מעוותות אחוזים.';

-- ══ 0012 — אצוות ייבוא וצפי העו"ש (החלטה 13) ══════════════
-- ── 1. אצוות ייבוא ─────────────────────────────────────────────────────────
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- 🔴 דוח אשראי **אינו תזרים לעו"ש**: 26 שורות כ.א.ל כבר מיוצגות בשורת
  --    ה-992.80 שבדוח העו"ש. חיבורן פרטנית לצפי הוא ספירה כפולה.
  kind text not null check (kind in ('bank_statement', 'credit_report')),
  -- תווית תצוגה שהפרסר מצהיר. **אינה מפתח שיוך** — ראו למעלה.
  source text not null,
  -- 🎯 המזהה שנשאב מהקובץ עצמו. זה מפתח השיוך היחיד.
  external_ref text,
  ref_kind text check (ref_kind in ('account', 'card')),
  -- החשבון המחויב. null = לא זוהה, ואז **מצהירים «אין דוח» ולא מנחשים**.
  account_id uuid references public.accounts (id) on delete set null,
  stated_total_agorot bigint,
  parsed_total_agorot bigint not null,
  row_count integer not null default 0,
  occurred_from date,
  occurred_to date,
  -- תאריך הפקת/צילום הדוח
  statement_date date,
  -- «חיוב בתאריך» — מוצהר ב-1 מ-3 הקבצים בלבד
  charge_date date,
  -- מתי החיוב ירד בפועל. נגזר משורת החיוב בדוח העו"ש, לא מנוחש.
  debited_on date,
  imported_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- 🪤 `nulls not distinct` נדרש במפורש: בברירת המחדל של פוסטגרס שתי שורות
--    עם `external_ref` ריק נחשבות שונות, והאילוץ לא היה תופס כלום דווקא
--    במקרה שבו הקובץ לא הצהיר מזהה.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'import_batches_identity_key'
      and conrelid = 'public.import_batches'::regclass
  ) then
    alter table public.import_batches
      add constraint import_batches_identity_key
      unique nulls not distinct (household_id, external_ref, parsed_total_agorot, statement_date);
  end if;
end $$;

create index if not exists import_batches_household_idx
  on public.import_batches (household_id, imported_at desc);

-- אצווה שטרם ירדה היא בדיוק מה שהצפי מנכה
create index if not exists import_batches_open_idx
  on public.import_batches (household_id) where debited_on is null;

create index if not exists import_batches_ref_idx
  on public.import_batches (household_id, external_ref) where external_ref is not null;

comment on table public.import_batches is
  'אצוות ייבוא. המזהה שנשאב מהקובץ (external_ref) הוא מפתח השיוך לחשבון, ולכן לצפי.';
comment on column public.import_batches.external_ref is
  'המזהה כפי שהקובץ מצהיר: «חשבון: 363-313550» / «כרטיס:4003». לא שם בנק — נמדד שאף קובץ אינו מצהיר שם בנק.';
comment on column public.import_batches.account_id is
  'החשבון המחויב. null אינו «אף חשבון» אלא «לא זוהה» — ואז האצווה מוצהרת ואינה מנוכה.';
comment on column public.import_batches.charge_date is
  '«חיוב בתאריך» מהקובץ. nullable — נמדד שרק 1 מ-3 הדוחות מצהיר עליו.';

alter table public.import_batches enable row level security;

drop policy if exists import_batches_select on public.import_batches;
create policy import_batches_select on public.import_batches for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists import_batches_insert on public.import_batches;
create policy import_batches_insert on public.import_batches for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists import_batches_update on public.import_batches;
create policy import_batches_update on public.import_batches for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists import_batches_delete on public.import_batches;
create policy import_batches_delete on public.import_batches for delete to authenticated
using (public.is_household_member(household_id));

-- ── 2. שורות החיוב המרוכז שבדוח העו"ש ──────────────────────────────────────
-- 🔴 **למה טבלה נפרדת ולא שאילתה על `transactions`.** שורת חיוב הכרטיס
--    בדוח העו"ש **אינה מיובאת** במכוון (`isCardCharge` ⇒ אינה מסומנת), כי
--    הסכום כבר מפורט בדוח האשראי וסימונה הייתה סופרת אותו כסף פעמיים.
--    ⇒ היא אינה קיימת ב-`transactions`, ולכן חייבת מקום משלה.
create table if not exists public.import_batch_charges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- אצוות דוח העו"ש שממנה נקראה השורה
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  -- מספר הכרטיס משורת «4003 - כרטיסי אשראי לי»
  external_ref text not null,
  amount_agorot bigint not null,
  occurred_on date not null
);

create index if not exists import_batch_charges_lookup_idx
  on public.import_batch_charges (household_id, external_ref, amount_agorot);

comment on table public.import_batch_charges is
  'שורות החיוב המרוכז מדוח העו"ש. (כרטיס, סכום) הוא מפתח ההתאמה לדוח אשראי — כרטיס לבדו מופיע 5 פעמים בדוח אחד.';

alter table public.import_batch_charges enable row level security;

drop policy if exists import_batch_charges_select on public.import_batch_charges;
create policy import_batch_charges_select on public.import_batch_charges for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists import_batch_charges_insert on public.import_batch_charges;
create policy import_batch_charges_insert on public.import_batch_charges for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists import_batch_charges_update on public.import_batch_charges;
create policy import_batch_charges_update on public.import_batch_charges for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists import_batch_charges_delete on public.import_batch_charges;
create policy import_batch_charges_delete on public.import_batch_charges for delete to authenticated
using (public.is_household_member(household_id));

-- ── 3. הקישור מתנועה לאצווה ────────────────────────────────────────────────
-- 🎯 `on delete set null` ולא `cascade`: מחיקת אצווה אינה אמורה למחוק את
--    התנועות שהמשתמש כבר סיווג. היא רק מבטלת את הקישור.
alter table public.transactions
  add column if not exists import_batch_id uuid references public.import_batches (id) on delete set null;

create index if not exists transactions_batch_idx
  on public.transactions (import_batch_id) where import_batch_id is not null;

comment on column public.transactions.import_batch_id is
  'האצווה שממנה יובאה התנועה. דרכה נגזר החשבון המחויב — לתנועה עצמה אין חשבון.';

-- ── 4. אינדקס למזהה החשבון ─────────────────────────────────────────────────
-- `accounts.external_ref` נוצרה ב-0011; כאן רק מאיצים את החיפוש שלה,
-- שהוא הצעד הראשון בכל שיוך.
create index if not exists accounts_external_ref_idx
  on public.accounts (household_id, external_ref) where external_ref is not null;

-- ── 5. החלטה 20: פירוט גובר על אגרגט ───────────────────────────────────────
-- 🔴 שורת «4003 - כרטיסי אשראי לי» בסך 992.80 בדוח העו"ש **היא אותו כסף**
--    כמו 26 השורות של דוח האשראי. ספירת שתיהן מנפחת את ההוצאה פי שניים.
--
-- 🎯 והכלל חייב לפעול **בשני סדרי הייבוא**. כשהעו"ש יובא ראשון, השורה כבר
--    קיימת כתנועה, ולכן דרוש סימון **למפרע** — ומכאן העמודה הזו.
--
-- ⚠️ ‏`on delete set null`: מחיקת אצוות האשראי מחזירה את שורת האגרגט
--    לספירה, וזה נכון — בלי הפירוט היא שוב הייצוג היחיד של אותו כסף.
alter table public.transactions
  add column if not exists superseded_by_batch_id uuid
    references public.import_batches (id) on delete set null;

create index if not exists transactions_superseded_idx
  on public.transactions (superseded_by_batch_id) where superseded_by_batch_id is not null;

comment on column public.transactions.superseded_by_batch_id is
  'חיוב מרוכז שהוחלף בפירוט מדוח אשראי. מסומן ⇒ אינו נספר ביתרה, כי אותו כסף כבר נספר בשורות המפורטות.';

-- 🎯 הקישור מהשורה המרוכזת לתנועה שנוצרה ממנה. בלעדיו אי אפשר לסמן למפרע
--    כשדוח האשראי מגיע **אחרי** דוח העו"ש: לא היה ממה למצוא את התנועה.
--    ‏null = השורה זוהתה בדוח אך לא יובאה (כי הפירוט כבר היה קיים).
alter table public.import_batch_charges
  add column if not exists transaction_id uuid
    references public.transactions (id) on delete set null;

comment on column public.import_batch_charges.transaction_id is
  'התנועה שנוצרה משורת החיוב המרוכז, אם יובאה. דרכה מסמנים אותה למפרע כשדוח האשראי מגיע אחר כך.';
-- ══ 0013 — חשבון התנועות (החלטות 18+19) ══════════════
alter table public.accounts
  add column if not exists is_transaction_account boolean not null default false;

comment on column public.accounts.is_transaction_account is
  'החשבון שכל התנועות יורדות ממנו. אחד לכל משק בית. כשאין אחד — מצהירים «לא נבחר חשבון» ולא מנחשים.';

-- 🎯 **אחד בלבד לכל משק בית**, ובאילוץ ולא בקוד: אינדקס ייחודי **חלקי**.
--    אילוץ מלא על (household_id, is_transaction_account) היה אוסר שני
--    חשבונות **לא** מסומנים — כלומר בדיוק המצב הרגיל.
create unique index if not exists accounts_transaction_account_key
  on public.accounts (household_id)
  where is_transaction_account;

-- 🔴 **סימון הוא החלפה, לא הוספה.** בלי זה המשתמש היה מקבל שגיאת
--    אילוץ סתומה במקום החלפת חשבון, ולכן ההחלפה נעשית אטומית בצד השרת.
create or replace function public.set_transaction_account(p_account uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.accounts where id = p_account;
  if v_household is null then
    raise exception 'account not found';
  end if;

  -- מבטלים קודם, אחרת האינדקס החלקי נופל באמצע
  update public.accounts
     set is_transaction_account = false
   where household_id = v_household
     and is_transaction_account
     and id <> p_account;

  update public.accounts
     set is_transaction_account = true
   where id = p_account;
end;
$$;

comment on function public.set_transaction_account(uuid) is
  'מסמן חשבון כאחראי על התנועות ומבטל את הקודם באותה טרנזקציה. RLS של accounts חלה כרגיל (security invoker).';

grant execute on function public.set_transaction_account(uuid) to authenticated;

-- 🎯 שאילתת הצבירה רצה על (משק בית, תאריך) — בדיוק האינדקס שכבר קיים
--    מ-0001 (`transactions_household_date_idx`), ולכן אין צורך בחדש.
