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
