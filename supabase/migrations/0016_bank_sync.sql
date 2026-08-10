-- 0016 — חיבור בנקים אוטומטי (סנכרון + תור אישור)
--
-- 🔴 נכתב במקור לפני 0015 (account_id בתנועות) ו-live_balances (יתרה חיה
--    לפי טריגר) — לכן bank_connections.account_id, שהיה בהתחלה רק "לצורך
--    מסך שווי נטו", הפך לחיוני: בלעדיו approve_bank_pending לא ידע לאיזה
--    חשבון לזקוף את התנועה, והיתרה החיה של אותו חשבון לא הייתה מתעדכנת.
--
-- 🔴 **האילוץ שקובע את הצורה הזו.** "חיבור בנק" בישראל פירושו גירוד מסך
--    (Puppeteer מול אתר הבנק בפועל) — זה חייב Node.js עם דפדפן אמיתי, ו-
--    Supabase Edge Functions (Deno) לא יכולות להריץ את זה. לכן הגירוד עצמו
--    קורה בתהליך נפרד שרץ מחוץ ל-Supabase (מחשב הבית, ראו bank-sync/),
--    ו-Supabase רק **מקבל** תנועות מוכנות דרך Edge Function ומנהל מטא-דאטה.
--    סיסמאות הבנק עצמן לא נכתבות לכאן בשום עמודה — הן לא עוזבות את המחשב
--    המקומי (מוצפנות שם, DPAPI). הטבלאות פה יודעות רק "יש חיבור בשם X,
--    מתי הוא סונכרן לאחרונה, ומה הוא הביא" — לא איך הוא מתחבר.
--
-- 🎯 **תנועות שנגרדות לא נכנסות ישר לתקציב.** הן נוחתות ב-bank_sync_pending
--    וממתינות לאישור ידני במסך (כמו הצ'קליסט של ייבוא קובץ ידני) — כי
--    צינור גירוד+דדופ חדש עלול לטעות, ועדיף שהטעות תיתפס לפני שהיא נכנסת
--    להיסטוריה המשותפת, לא אחרי.

-- ── 1. חיבורי בנק ────────────────────────────────────────────────────────────
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- companyId כפי שה-scraper המקומי מצהיר עליו, למשל 'hapoalim' / 'otsarHahayal'
  institution text not null,
  nickname text not null default '',
  -- חשבון קיים (למסך שווי נטו) שהחיבור הזה משויך אליו — לא חובה
  account_id uuid references public.accounts (id) on delete set null,
  status text not null default 'pending_setup'
    check (status in ('pending_setup', 'ok', 'error')),
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bank_connections_household_idx
  on public.bank_connections (household_id, created_at desc);

comment on table public.bank_connections is
  'מטא-דאטה על חיבור בנק. אינה מכילה סיסמאות — אלה נשארות מוצפנות במחשב המקומי שמריץ את הגירוד.';
comment on column public.bank_connections.status is
  'pending_setup = נוצר באתר אך טרם רץ setup מקומי; ok/error מתעדכנים ע"י bank-sync-ingest אחרי כל ריצה.';

alter table public.bank_connections enable row level security;

drop policy if exists bank_connections_select on public.bank_connections;
create policy bank_connections_select on public.bank_connections for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists bank_connections_insert on public.bank_connections;
create policy bank_connections_insert on public.bank_connections for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists bank_connections_update on public.bank_connections;
create policy bank_connections_update on public.bank_connections for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists bank_connections_delete on public.bank_connections;
create policy bank_connections_delete on public.bank_connections for delete to authenticated
using (public.is_household_member(household_id));

-- ── 2. לוג ריצות סנכרון ──────────────────────────────────────────────────────
-- 🎯 select בלבד למשתמשים — insert/update מגיעים אך ורק מ-bank-sync-ingest
--    עם service role (בדיוק כמו securities/fx_rates ב-0010), כדי שאף לקוח
--    לא יוכל "לזייף" ריצת סנכרון מוצלחת.
create table if not exists public.bank_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'ok' check (status in ('ok', 'error')),
  found_count integer not null default 0,
  inserted_count integer not null default 0,
  error_message text
);

create index if not exists bank_sync_runs_connection_idx
  on public.bank_sync_runs (connection_id, started_at desc);

alter table public.bank_sync_runs enable row level security;

drop policy if exists bank_sync_runs_select on public.bank_sync_runs;
create policy bank_sync_runs_select on public.bank_sync_runs for select to authenticated
using (public.is_household_member(household_id));

-- ── 3. תור אישור ─────────────────────────────────────────────────────────────
-- 🎯 גם כאן select בלבד למשתמשים: הכנסה היא service role בלבד (ingest),
--    ועדכון סטטוס עובר תמיד דרך approve_bank_pending/reject_bank_pending
--    (security definer, ראו למטה) ולא דרך update ישיר על הטבלה — כדי
--    שהאישור תמיד ייצור את התנועה התואמת ולא ישאיר pending "מאושר" בלי תנועה.
create table if not exists public.bank_sync_pending (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  -- מזהה/hash שה-scraper מספק לתנועה הבודדת; מפתח הדדופ מול ריצות חופפות
  external_id text not null,
  occurred_on date not null,
  amount_agorot bigint not null check (amount_agorot > 0),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  description text,
  suggested_category_id uuid references public.categories (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  unique (connection_id, external_id)
);

create index if not exists bank_sync_pending_household_status_idx
  on public.bank_sync_pending (household_id, status, occurred_on desc);

comment on table public.bank_sync_pending is
  'תנועות שנגרדו וממתינות לאישור המשתמש לפני שהן הופכות לתנועה אמיתית. ראו approve_bank_pending/reject_bank_pending.';

alter table public.bank_sync_pending enable row level security;

drop policy if exists bank_sync_pending_select on public.bank_sync_pending;
create policy bank_sync_pending_select on public.bank_sync_pending for select to authenticated
using (public.is_household_member(household_id));

-- ── 4. הקישור מתנועה מאושרת לשורת ה-pending שיצרה אותה ──────────────────────
alter table public.transactions
  add column if not exists bank_pending_id uuid references public.bank_sync_pending (id) on delete set null;

-- מונע אישור כפול (שתי לחיצות מקבילות) גם אם הבדיקה בתוך הפונקציה תוחמצת
create unique index if not exists transactions_bank_pending_idx
  on public.transactions (bank_pending_id) where bank_pending_id is not null;

comment on column public.transactions.bank_pending_id is
  'שורת bank_sync_pending שאושרה ויצרה את התנועה הזו. במקביל ל-recurring_rule_id/import_batch_id.';

-- ── 5. אישור/דחייה — security definer, בדיוק כמו apply_recurring/invite_to_household ──
create or replace function public.approve_bank_pending(p_pending_id uuid, p_category_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.bank_sync_pending;
  v_account_id uuid;
  tx_id uuid;
begin
  select * into p from public.bank_sync_pending where id = p_pending_id;

  if p.id is null then
    raise exception 'תנועת הבנק לא נמצאה';
  end if;

  if not public.is_household_member(p.household_id) then
    raise exception 'not a member of this household';
  end if;

  if p.status <> 'pending' then
    raise exception 'התנועה כבר טופלה';
  end if;

  -- 🎯 מ-0015+live_balances: לתנועה חייב חשבון, אחרת אין למי לזקוף אותה
  --    ואין את מי לעדכן ביתרה החיה. "לא מוגדר" מוצהר, לא מנוחש בשקט —
  --    בדיוק כמו import_batches.account_id null = "לא זוהה".
  select account_id into v_account_id from public.bank_connections where id = p.connection_id;
  if v_account_id is null then
    raise exception 'לחיבור הזה אין חשבון מקושר — יש לקשר חשבון במסך "חיבור בנקים" לפני אישור תנועות';
  end if;

  insert into public.transactions
    (household_id, user_id, category_id, kind, amount_agorot, occurred_on, note, bank_pending_id, account_id)
  values
    (p.household_id, auth.uid(), coalesce(p_category_id, p.suggested_category_id),
     p.kind, p.amount_agorot, p.occurred_on, p.description, p.id, v_account_id)
  returning id into tx_id;

  update public.bank_sync_pending
     set status = 'approved', resolved_at = now(), resolved_by = auth.uid()
   where id = p.id;

  return tx_id;
end;
$$;

create or replace function public.reject_bank_pending(p_pending_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.bank_sync_pending;
begin
  select * into p from public.bank_sync_pending where id = p_pending_id;

  if p.id is null then
    raise exception 'תנועת הבנק לא נמצאה';
  end if;

  if not public.is_household_member(p.household_id) then
    raise exception 'not a member of this household';
  end if;

  if p.status <> 'pending' then
    raise exception 'התנועה כבר טופלה';
  end if;

  update public.bank_sync_pending
     set status = 'rejected', resolved_at = now(), resolved_by = auth.uid()
   where id = p.id;
end;
$$;

grant execute on function public.approve_bank_pending(uuid, uuid) to authenticated;
grant execute on function public.reject_bank_pending(uuid) to authenticated;
