-- HomeBase :: 0011 סיווג נכסים, «העברה להשקעות», וכיס הממתינים לשיוך
--
-- שלוש דרישות שנעולות מול המשתמש, ואחת מהן מתקנת שגיאה חשבונאית שקטה.
--
-- ── למה `securities.asset_class` ולא `accounts.kind` ─────────────────────────
-- 🎯 **חשבון אחד פורש שתי קטגוריות בגרף.** חשבון בנק מחזיק גם יתרת עו"ש
--    וגם קרן כספית, וחשבון בית השקעות מחזיק גם ניירות וגם מזומן מט"ח
--    (הפרסר מייצר לו `USDILS=X`). גזירת הגרף מ-`accounts.kind` — הדרך
--    הקצרה, שלא דורשת עמודה חדשה — הייתה מציגה קרן כספית כ«עו"ש»
--    **בשקט, בלי שום שגיאה**. הסיווג חייב לשבת על הנייר, לא על החשבון.
--
-- ── למה `is_capital_move` ולא שם הקטגוריה ───────────────────────────────────
-- המשתמש יכול לשנות שם קטגוריה מהממשק. דגל שורד שינוי שם; מחרוזת לא.
--
-- ── האריתמטיקה של הכיס ──────────────────────────────────────────────────────
--   עו"ש 5,000 · השקעות 100,000 · סה"כ 105,000
--   הוצאה «העברה להשקעות» 3,000 ⇒ העו"ש יורד ל-2,000
--   בלי כיס:  2,000 + 100,000 = 102,000   🔴 3,000 ₪ מתאדים
--   עם כיס:   2,000 + 100,000 + 3,000 = 105,000 ✅
-- הכסף כבר יצא מהעו"ש אבל עדיין לא הופיע כאחזקה — הכיס מחזיק אותו בתווך.
--
-- 🪤 הזריעה מופיעה בשני מקומות (`0003_functions.sql` ו-`supabase/setup.sql`),
--    ולכן קטגוריה חדשה דורשת **שלוש** נקודות שינוי: זרע לחדשים, הוספה
--    לקיימים, ו-setup.sql. זה בדיוק מה ש-0009 לימד.

-- ── 1. סיווג נכסים ─────────────────────────────────────────────────────────
-- ⚠️ ברירת מחדל, לא גזירת גורל: הערך ניתן לעריכה ידנית מהממשק.
alter table public.securities
  add column if not exists asset_class text not null default 'equity'
    check (asset_class in ('equity', 'money_market', 'bond', 'cash', 'other'));

comment on column public.securities.asset_class is
  'סיווג לגרף ההתפלגות. נקבע אוטומטית מהקטלוג וניתן לעריכה ידנית.';

-- ── 2. דגל תנועת הון ───────────────────────────────────────────────────────
-- הוצאה שמסומנת כך יוצאת מהעו"ש אבל **אינה** מקטינה את ההון: הכסף עבר
-- כיס, לא נצרך.
alter table public.categories
  add column if not exists is_capital_move boolean not null default false;

comment on column public.categories.is_capital_move is
  'תנועת הון: הכסף עובר בין חשבונות ולא נצרך. מקטין את צפי העו"ש, לא את ההון.';

-- ── 3. קטגוריית «העברה להשקעות» ────────────────────────────────────────────
-- 🔴 קטגוריה **נפרדת** מ«העברות כספים» של 0009. זו לביט/פייבוקס — כסף
--    שיוצא לכל מטרה; זו החדשה היא כסף שנשאר של המשתמש.

-- 3א. משקי בית חדשים
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

-- 3ב. משקי בית קיימים
-- ⚠️ ל-`categories` אין אילוץ ייחודיות על (household_id, name, kind), ולכן
-- האידמפוטנטיות היא ב-`not exists` ולא ב-`on conflict`.
insert into public.categories (household_id, name, icon, color, kind, sort_order, is_capital_move)
select h.id, 'העברה להשקעות', 'trending-up', '#3F6BA9', 'expense', 160, true
from public.households h
where not exists (
  select 1
  from public.categories c
  where c.household_id = h.id
    and c.name = 'העברה להשקעות'
    and c.kind = 'expense'
);

-- 3ג. אם הקטגוריה כבר קיימת מהרצה קודמת, לוודא שהדגל דלוק
update public.categories
set is_capital_move = true
where name = 'העברה להשקעות' and kind = 'expense' and is_capital_move = false;

-- ── 4. שיוך חשבון לבנק ─────────────────────────────────────────────────────
-- 🔴 התאמת חיובים חייבת להיות **מוגבלת לאותו בנק**. למשתמש כרטיס אשראי
--    בבנק אחד ודוח עו"ש מבנק אחר; חיובי הכרטיס הזה לעולם לא יופיעו בדוח
--    ההוא. התאמה גלובלית הייתה מסמנת אותם «טרם ירדו» **לצמיתות** ומציגה
--    צפי שגוי בקביעות, בלי שום שגיאה. כשאין דוח לבנק — מצהירים, לא מעריכים.
alter table public.accounts
  add column if not exists external_ref text;

comment on column public.accounts.external_ref is
  'מספר החשבון כפי שהוא בדוחות הבנק. משמש לשיוך חיובים לחשבון הנכון בלבד.';

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
    )::bigint as value_agorot
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
    a.balance_agorot as value_agorot
  from public.accounts a
  where a.is_archived = false and a.balance_agorot <> 0
),
-- הכיס: פרוסה נפרדת, ומופיעה רק כשיש בה משהו
from_pending as (
  select
    p.household_id,
    'pending' as asset_class,
    sum(p.amount_agorot)::bigint as value_agorot
  from public.pending_allocations p
  where p.resolved_at is null
  group by p.household_id
)
select household_id, asset_class, sum(value_agorot)::bigint as value_agorot
from (
  select household_id, asset_class, value_agorot from from_holdings
  union all
  select household_id, asset_class, value_agorot from from_balances
  union all
  select household_id, asset_class, value_agorot from from_pending
) all_sources
group by household_id, asset_class
having sum(value_agorot) <> 0;

comment on view public.net_worth_by_asset_class is
  'התפלגות ההון לפי מחלקת נכס. ניירות לפי securities.asset_class, יתרות לפי accounts.kind, והכיס כפרוסה נפרדת.';
