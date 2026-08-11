-- 0018 — שלושה באגים אמיתיים שנמצאו בסבב בדיקות קצה-לקצה (שני agents עצמאיים,
-- ממצא 1 אושר על ידי שניהם בנפרד)
--
-- 🔴 **באג 1: אפשר לצאת ממשק בית ולהישאר איתו לתמיד.** leaveHousehold עשתה
--    delete גולמי בלי לבדוק אם זה החבר האחרון. עוזב אחרון ⇒ household_members
--    ריקה ⇒ שום פוליסי RLS (is_household_member/is_household_owner) לא יכול
--    להתאים יותר ⇒ כל הנתונים (תנועות, חשבונות, קטגוריות) נעולים לצמיתות,
--    בלי אף מסך שיכול להגיע אליהם. אין "שחזור" — רק household_members ריקה.
--
-- 🔴 **באג 2: הבעלים יכול לעזוב ולהשאיר משק בית בלי בעלים.** households_update
--    /households_delete דורשים is_household_owner — ובלי בעלים, שינוי שם/
--    מחיקה נעולים לצמיתות לכל החברים הנותרים. וזה נכשל **בשקט**: renameHousehold
--    עושה update+select('id') ו-unwrap בודקת רק error, לא כמות שורות — RLS
--    שחוסם מחזיר data:[] בלי error, וההודעה למשתמש עדיין "שם משק הבית עודכן".
--
-- 🔴 **באג 3: מחיקת יעד מפורש חוזרת לבד בפתיחה הבאה.** rollover_budgets בודקת
--    "יש כבר שורה לחודש הזה?" ולא "כבר ניסינו rollover לחודש הזה?" — אלה לא
--    אותו דבר. משתמש שמוחק את כל היעדים לחודש (amountAgorot<=0 ⇒ delete,
--    ראו db.ts:setBudget) מקבל אותם בחזרה בפתיחה הבאה של האפליקציה, כי
--    rollover_budgets רץ על כל refreshHouseholds (HouseholdContext.tsx) ורואה
--    "אין שורות" ⇒ "עוד לא הרצנו" ⇒ מעתיק מהחודש הקודם מחדש.
--
-- 🎯 **ולא-באג רביעי שכן תוקן כאן כי הוא קרוב:** recurring rule שמקושר לחשבון
--    שאורכב ממשיך ליצור תנועות אמיתיות על חשבון שלא מוצג בשום מקום (net worth,
--    בוררי חשבון) — כסף אמיתי זז בלי שאף מסך יכול להראות את זה.

-- ── 1. עזיבה/הסרה: RPC ידידותי + חסימת "אחרון עוזב" גם ב-RLS ────────────────
-- 🎯 פרמטר יעד אופציונלי: המסך (members.tsx) קורא לאותה פונקציה גם ל"יציאה
--    ממשק הבית" (עצמי) וגם ל"הסרת בן בית" (הבעלים מסיר מישהו אחר) — חייבת
--    לתמוך בשני המקרים, לא רק בעצמי.
-- 🔴 **ולמה RPC ולא רק RLS.** delete שנחסם ע"י RLS לא מחזיר error — הוא
--    פשוט לא מוחק כלום ומחזיר 0 שורות, וה-unwrap() הקיים בודק רק error.
--    בלי RPC, leaveHousehold הייתה "מצליחה" בשקט בלי להסיר אף אחד — בדיוק
--    אותה מחלקת באג כמו renameHousehold (באג 2 למעלה: unwrap בודקת רק
--    error, לא כמות שורות — תוקן בצד הלקוח ב-src/lib/db.ts).
create or replace function public.leave_household(p_household_id uuid, p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_member_count int;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  if v_target <> auth.uid() and not public.is_household_owner(p_household_id) then
    raise exception 'רק הבעלים יכול להסיר בן בית אחר';
  end if;

  select count(*) into v_member_count
  from public.household_members
  where household_id = p_household_id;

  if v_member_count <= 1 then
    raise exception 'אי אפשר להסיר את החבר האחרון במשק הבית — אפשר למחוק אותו מהגדרות במקום.';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = v_target;
end;
$$;

grant execute on function public.leave_household(uuid, uuid) to authenticated;

-- 🎯 חסימה גם ברמת ה-RLS, לא רק ב-RPC: exists בודק אם יישאר לפחות עוד חבר
--    אחד חוץ מהשורה שנמחקת ברגע הזה. הגנה כפולה — אם מישהו ידלג על ה-RPC
--    ויקרא ל-delete ישירות על הטבלה, עדיין לא יוכל להשאיר אותה ריקה.
drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members for delete to authenticated
using (
  (user_id = auth.uid() or public.is_household_owner(household_id))
  and exists (
    select 1 from public.household_members m2
    where m2.household_id = household_members.household_id
      and m2.id <> household_members.id
  )
);

-- ── 2. עזיבת בעלים: מקדם אוטומטית את החבר הוותיק ביותר שנשאר ────────────────
-- 🎯 BEFORE DELETE ולא AFTER: מריצים את הבדיקה כשהשורה שעוזבת עדיין נראית
--    (כדי לדעת אם *היא* הייתה הבעלים), אבל מחריגים אותה מפורשות מהמועמדים.
create or replace function public.promote_owner_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_owner uuid;
begin
  if old.role = 'owner' then
    if not exists (
      select 1 from public.household_members
      where household_id = old.household_id and role = 'owner' and id <> old.id
    ) then
      select id into v_new_owner
      from public.household_members
      where household_id = old.household_id and id <> old.id
      order by joined_at asc
      limit 1;

      if v_new_owner is not null then
        update public.household_members set role = 'owner' where id = v_new_owner;
      end if;
    end if;
  end if;
  return old;
end;
$$;

comment on function public.promote_owner_on_leave() is
  'כשבעלים עוזב ואין בעלים אחר, מקדם את החבר הוותיק ביותר שנשאר — כדי שרינוי/מחיקה של משק הבית (RLS דורש is_household_owner) לא ייתקעו לצמיתות.';

drop trigger if exists trg_promote_owner_on_leave on public.household_members;
create trigger trg_promote_owner_on_leave
  before delete on public.household_members
  for each row execute function public.promote_owner_on_leave();

-- ── 3. rollover_budgets: "כבר ניסינו" ולא "יש שורות" ────────────────────────
-- 🔴 ההבדל קריטי: משתמש שמוחק בכוונה את כל היעדים לחודש (amountAgorot<=0 ⇒
--    delete, ראו db.ts) חייב שזה יישאר מחוק — לא "עוד לא רץ rollover".
create table if not exists public.budget_rollovers (
  household_id uuid not null references public.households (id) on delete cascade,
  month date not null,
  ran_at timestamptz not null default now(),
  primary key (household_id, month)
);

alter table public.budget_rollovers enable row level security;

drop policy if exists budget_rollovers_select on public.budget_rollovers;
create policy budget_rollovers_select on public.budget_rollovers for select to authenticated
using (public.is_household_member(household_id));
-- אין insert/update/delete policy למשתמשים בכוונה: רק rollover_budgets
-- (security definer) כותבת לכאן, כמו securities/fx_rates ב-0010.

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

  if exists (select 1 from public.budget_rollovers where household_id = p_household_id and month = m) then
    return;
  end if;

  insert into public.budget_rollovers (household_id, month) values (p_household_id, m)
  on conflict (household_id, month) do nothing;

  insert into public.budgets (household_id, category_id, month, amount_agorot)
  select household_id, category_id, m, amount_agorot
  from public.budgets
  where household_id = p_household_id and month = prev;
end;
$$;

grant execute on function public.rollover_budgets(uuid, date) to authenticated;

-- ── 4. apply_recurring מדלג על כלל שמקושר לחשבון מאורכב ─────────────────────
-- 🔴 בלי זה: כלל חוזר ממשיך ליצור תנועות אמיתיות ולהזיז balance_agorot של
--    חשבון שאורכב — כסף שזז בלי ששום מסך (net worth, בוררי חשבון) מראה אותו.
--    לא מקדמים last_run_month עבור כלל כזה — כשיקושר לחשבון תקין הוא ישלים
--    את מה שפוספס, במקום לאבד את החודשים ההם בשקט לצמיתות.
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
      and (
        account_id is null
        or exists (select 1 from public.accounts a where a.id = account_id and not a.is_archived)
      )
  loop
    target := least(
      m + (r.day_of_month - 1),
      (m + interval '1 month - 1 day')::date
    );

    if target <= current_date then
      insert into public.transactions
        (household_id, user_id, category_id, kind, amount_agorot, occurred_on, note, recurring_rule_id, is_shared, account_id)
      values
        (r.household_id, r.created_by, r.category_id, r.kind, r.amount_agorot, target, r.title, r.id, r.is_shared, r.account_id)
      on conflict do nothing;

      update public.recurring_rules set last_run_month = m where id = r.id;
      inserted := inserted + 1;
    end if;
  end loop;

  return inserted;
end;
$$;
