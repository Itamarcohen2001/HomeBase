-- HomeBase :: 0009 קטגוריית «העברות כספים»
--
-- העברות דרך ביט / פייבוקס הן כסף שיוצא לכל מטרה, ואי אפשר לנחש להן בית עסק.
-- עד היום הן הגיעו למסך האישור בלי קטגוריה בכלל. מעכשיו יש להן יעד קבוע,
-- ו-`guessCategoryName` מפנה אליהן את הצד היוצא (הצד הנכנס הולך ל«הכנסה אחרת»
-- שכבר נזרעת מאז 0003).
--
-- ⚠️ הזריעה מופיעה בשני מקומות: `0003_functions.sql` ו-`supabase/setup.sql`.
-- 0003 כבר רץ בפרודקשן ולכן עריכה שלו במקום אינה משנה דבר; לכן הפונקציה
-- מוגדרת כאן מחדש, ובנוסף הקטגוריה נוספת למשקי בית קיימים.

-- ── 1. משקי בית חדשים ───────────────────────────────────────────────────────
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
    (hid, 'העברות כספים',    'swap-horizontal',   '#7A6BDF', 'expense', 150),
    (hid, 'שונות',           'ellipsis-horizontal','#8A94A6','expense', 200),
    (hid, 'משכורת',          'briefcase',         '#2E9E6B', 'income',  10),
    (hid, 'עסק עצמאי',       'business',          '#4F7FE4', 'income',  20),
    (hid, 'קצבאות',          'wallet',            '#F2C14E', 'income',  30),
    (hid, 'הכנסה אחרת',      'add-circle',        '#8A94A6', 'income',  40)
  on conflict do nothing;
end;
$$;

-- ── 2. משקי בית קיימים ──────────────────────────────────────────────────────
-- ⚠️ ל-`categories` אין אילוץ ייחודיות על (household_id, name, kind), ולכן
-- `on conflict do nothing` לא היה מונע כפילות בהרצה שנייה. השמירה על
-- אידמפוטנטיות היא ב-`not exists`.
insert into public.categories (household_id, name, icon, color, kind, sort_order)
select h.id, 'העברות כספים', 'swap-horizontal', '#7A6BDF', 'expense', 150
from public.households h
where not exists (
  select 1
  from public.categories c
  where c.household_id = h.id
    and c.name = 'העברות כספים'
    and c.kind = 'expense'
);
