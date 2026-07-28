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
