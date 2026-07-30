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
