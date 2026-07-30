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
