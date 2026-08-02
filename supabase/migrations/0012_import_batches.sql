-- 0012 — אצוות ייבוא וצפי העו"ש (החלטה 13)
--
-- 🔴 **הבעיה שהמיגרציה הזו פותרת, ולמה היא הכרחית.**
--
-- החלטה 13 קובעת שסך ההון משתמש ב**צפי** העו"ש ולא ביתרה:
--
--     צפי = יתרה − חיובים שטרם ירדו + תנועות אחרי תאריך היתרה
--
-- שני האיברים דרשו קלט שלא היה קיים. מדדתי על כל 11 המיגרציות:
-- ל-`transactions` אין `account_id` באף אחת מהן, ולא הייתה טבלת אצוות.
-- ⇒ תנועה שייכת למשק בית, לא לחשבון, ולכן אי אפשר היה לצמצם אותה לבנק.
--
-- 🪤 **ולמה זה מסוכן ולא רק חסר.** למשתמש שני בנקים: כרטיס הפועלים מחויב
--    בחשבון אחד, ודוח העו"ש שברשותנו הוא של הבינלאומי. התאמה **גלובלית**
--    הייתה מסמנת את חיובי הפועלים «טרם ירדו» **לצמיתות** ומציגה צפי שגוי
--    **בקביעות, בלי שום שגיאה** — והצפי הוא המספר הראשי במסך.
--    ⇒ ההתאמה חייבת להיות מוגבלת לאותו מוסד, וכשאין דוח — **להצהיר**.
--
-- 🎯 הזיהוי עצמו דטרמיניסטי ולא היוריסטי: שורת חיוב בדוח העו"ש ששווה
--    ל**סך** של דוח אשראי מייבאת את הקישור. לכן נשמר סך האצווה.
--    (`992.80` = דוח אוצר החייל · `644.58` = דוח נוסף; סכום מומצא לא נמצא.)
--
-- 🪤 ואי אפשר להישען על «חיוב בתאריך» שבקובץ: 4 מתוך 5 הדוחות מצהירים
--    עליו, **והפועלים לא** — הוא מצהיר «תאריך הפקה» בלבד.

-- ── 1. אצוות ייבוא ─────────────────────────────────────────────────────────
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- 'credit' = דוח אשראי שירד כחיוב אחד; 'bank' = דוח עו"ש
  kind text not null default 'credit' check (kind in ('credit', 'bank')),
  -- מה שהפרסר הצהיר על הקובץ. שדה מובנה, לא מזהה קשיח.
  source text not null,
  -- המוסד שאליו החיוב שייך. ניתן לעריכה ידנית — הנרמול הוא ברירת מחדל.
  institution text,
  -- החשבון שמחויב. null = לא זוהה, ואז **מצהירים ולא מנחשים**.
  account_id uuid references public.accounts (id) on delete set null,
  -- 🎯 הסך הוא המפתח להתאמה מול שורת החיוב בדוח העו"ש
  stated_total_agorot bigint,
  parsed_total_agorot bigint not null,
  row_count integer not null default 0,
  occurred_from date,
  occurred_to date,
  -- מתי החיוב ירד בפועל, אם זוהה. null = טרם ירד **או** לא ידוע.
  debited_on date,
  imported_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists import_batches_household_idx
  on public.import_batches (household_id, imported_at desc);

-- אצווה שטרם ירדה היא בדיוק מה שהצפי מנכה
create index if not exists import_batches_open_idx
  on public.import_batches (household_id) where debited_on is null;

comment on table public.import_batches is
  'אצוות ייבוא. הסך שלהן הוא המפתח להתאמה מול שורת החיוב בדוח העו"ש, ולכן לצפי.';
comment on column public.import_batches.account_id is
  'החשבון המחויב. null אינו «אף חשבון» אלא «לא זוהה» — ואז האצווה מוצהרת ואינה מנוכה.';
comment on column public.import_batches.debited_on is
  'מתי החיוב ירד בפועל. null = טרם ירד או לא ידוע; ההבחנה נעשית מול תאריך היתרה.';

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

-- ── 2. הקישור מתנועה לאצווה ────────────────────────────────────────────────
-- 🎯 `on delete set null` ולא `cascade`: מחיקת אצווה אינה אמורה למחוק את
--    התנועות שהמשתמש כבר סיווג. היא רק מבטלת את הקישור.
alter table public.transactions
  add column if not exists import_batch_id uuid references public.import_batches (id) on delete set null;

create index if not exists transactions_batch_idx
  on public.transactions (import_batch_id) where import_batch_id is not null;

comment on column public.transactions.import_batch_id is
  'האצווה שממנה יובאה התנועה. דרכה נגזר החשבון המחויב — לתנועה עצמה אין חשבון.';
