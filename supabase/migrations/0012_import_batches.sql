-- 0012 — אצוות ייבוא וצפי העו"ש (החלטה 13)
--
-- 🔴 **הבעיה שהמיגרציה הזו פותרת.**
--
-- החלטה 13 קובעת שסך ההון משתמש ב**צפי** העו"ש ולא ביתרה:
--
--     צפי = יתרה − חיובים שטרם ירדו
--
-- שני האיברים דרשו קלט שלא היה קיים. נמדד על כל 11 המיגרציות:
-- ל-`transactions` אין `account_id` באף אחת מהן, ולא הייתה טבלת אצוות.
-- ⇒ תנועה שייכת למשק בית, לא לחשבון, ולכן אי אפשר היה לצמצם אותה לבנק.
--
-- 🔴 **ולמה שם הבנק אינו יכול להיות המפתח.** נמדד על שלושת הקבצים
--    האמיתיים: חיפוש 7 שמות בנק (הבינלאומי · בינלאומי · אוצר החייל ·
--    הפועלים · בנק הפועלים · לאומי · דיסקונט) מחזיר **אפס התאמות בכל
--    שלושת הקבצים**. אין לשם הבנק מקור אמת בנתונים.
--    ובנוסף, השוואת מחרוזות מייצרת חיובי-שגוי שקט:
--    ‏`'הבינלאומי'.includes('לאומי') === true` ⇒ חשבון «לאומי» היה מנכה
--    חיוב של הבינלאומי, בלי שום שגיאה.
--
-- 🎯 **המפתח הוא המספר שהקובץ מצהיר עליו**, ושלושתם מצהירים:
--
--     FibiSave   «חשבון: 363-313550 תאריך:31/07/2026»        → account
--     הפועלים    «מספר חשבון  12-556-568338  תאריך הפקה»      → account
--     כ.א.ל      «כרטיס:4003 - ויזה כ.א.ל חודש החיוב»         → card
--
--    ⇒ אפס קלט מהמשתמש, אפס ניחוש שמות. והתווית «חשבון»/«כרטיס» היא
--    שדה מובנה שהקובץ כותב, ולכן היא גם קובעת את סוג המזהה.
--
-- 🎯 **והחוליה שסוגרת את השרשרת:** שורת החיוב בדוח העו"ש מתחילה באותו
--    מספר כרטיס — «4003 - כרטיסי אשראי לי» בסכום 992.80. אותו `4003`
--    שדוח האשראי מצהיר. שני קבצים נפרדים, מזהה זהה, סכום זהה לאגורה.
--
-- 🪤 **וההתאמה חייבת להיות (כרטיס, סכום) ולא כרטיס לבדו.** נמדד: הכרטיס
--    4003 מופיע **חמש פעמים** בדוח העו"ש —
--    992.80 · 4,538.60 · 2,634.21 · 644.58 · 1,145.36 —
--    וכרטיס לבדו היה נקשר לשורה השגויה.
--
-- 🪤 ואי אפשר להישען על «חיוב בתאריך» שבקובץ: נמדד שרק **1 מ-3** מצהיר
--    עליו (כ.א.ל). הפועלים מצהיר «תאריך הפקה» ו-FibiSave «תאריך».
--    ⇒ `charge_date` הוא nullable, וחיזוק בלבד.

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
