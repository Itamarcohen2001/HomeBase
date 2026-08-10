-- 0017 — שני באגים אמיתיים שנמצאו בסקירת קוד אחרי 0015+live_balances
--
-- 🔴 **באג 1: apply_recurring לא כותב account_id.** בדיוק המלכודת ש-0007
--    כבר הזהירה מפניה במפורש ("לא מספיק להוסיף עמודה לטבלה ולממשק —
--    apply_recurring יוצרת את התנועה בפועל ובלי לעדכן אותה כל תנועה
--    אוטומטית תישבר בשקט") — ו-0015 נפלה בדיוק לתוך המלכודת הזו. התוצאה:
--    כל תנועה שנוצרת מהוצאה קבועה נכנסת עם account_id=null, והטריגר
--    on_transaction_change (live_balances) מתעדכן רק כש-account_id לא
--    null ⇒ יתרת החשבון החי לעולם לא מזיזה בגלל הוצאות/הכנסות קבועות.
--
-- 🔴 **באג 2: אין בדיקה שהחשבון המקושר שייך לאותו משק בית.** ל-RLS של
--    transactions/recurring_rules/bank_connections יש רק is_household_member
--    על household_id של השורה עצמה — שום דבר לא בודק ש-account_id שנשלח
--    בפועל שייך לאותו household_id. חבר משק בית יכול לשלוח account_id של
--    חשבון ממשק בית זר (מזהה uuid בלבד, לא צריך גישה אליו), ולגרום לטריגר
--    לעדכן יתרה של חשבון שאינו שלו — לא רק קריאה חוצת-משק-בית, כתיבה.

-- ── 1. apply_recurring כותב גם account_id ────────────────────────────────────
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

-- ── 2. טריגר שמוודא account_id.household_id = household_id של השורה ─────────
-- 🎯 security definer ולא invoker: אם account_id מצביע על חשבון ממשק בית
--    זר, ה-RLS של accounts היה מסתיר אותו מהמשתמש (select ריק) — וזה היה
--    הופך "לא שייך" ל"לא נמצא", בדיקה עמומה. definer רואה את החשבון בכל
--    מקרה ובודק את הכלל העסקי עצמו: household_id תואם, לא נגישות.
create or replace function public.check_account_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_household uuid;
begin
  if new.account_id is null then
    return new;
  end if;

  select household_id into v_account_household
  from public.accounts
  where id = new.account_id;

  if v_account_household is null then
    raise exception 'החשבון לא נמצא';
  end if;

  if v_account_household <> new.household_id then
    raise exception 'החשבון שייך למשק בית אחר';
  end if;

  return new;
end;
$$;

comment on function public.check_account_household() is
  'מוודא ש-account_id בשורה (transactions/recurring_rules/bank_connections) שייך לאותו household_id כמו השורה עצמה — RLS לבדו לא בודק את זה.';

drop trigger if exists trg_check_account_household on public.transactions;
create trigger trg_check_account_household
  before insert or update on public.transactions
  for each row execute function public.check_account_household();

drop trigger if exists trg_check_account_household on public.recurring_rules;
create trigger trg_check_account_household
  before insert or update on public.recurring_rules
  for each row execute function public.check_account_household();

drop trigger if exists trg_check_account_household on public.bank_connections;
create trigger trg_check_account_household
  before insert or update on public.bank_connections
  for each row execute function public.check_account_household();

-- ── 3. on_transaction_change מעדכן גם captured_at, לא רק balance_agorot ─────
-- 🔴 **הצגת "לא עודכן" הפכה שקרית.** stalenessLabel/isStale (networth.ts)
--    מציגים "עודכן לפני X ימים" לפי captured_at — וזה היה נכון כשהעדכון
--    היחיד היה הקלדה ידנית (updateAccountBalance). אחרי live_balances,
--    הטריגר מעדכן balance_agorot בכל תנועה **בלי לגעת ב-captured_at** —
--    כלומר חשבון עם עשרות תנועות אוטומטיות בשבוע האחרון עדיין הראה
--    "לא עודכן 45 יום" (מתי שמישהו הקליד יתרה בפעם האחרונה), למרות
--    שהיתרה שלו מדויקת לגמרי כרגע. captured_at מעכשיו פירושו "מתי אימתנו
--    לאחרונה שהיתרה נכונה" — בין אם בהקלדה ידנית ובין אם בתנועה אמיתית.
create or replace function public.on_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.account_id is not null then
      update public.accounts
      set balance_agorot = balance_agorot + (case when new.kind = 'income' then new.amount_agorot else -new.amount_agorot end),
          captured_at = now()
      where id = new.account_id;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    if old.account_id is not null then
      update public.accounts
      set balance_agorot = balance_agorot - (case when old.kind = 'income' then old.amount_agorot else -old.amount_agorot end),
          captured_at = now()
      where id = old.account_id;
    end if;
    return old;

  elsif tg_op = 'UPDATE' then
    -- Revert old
    if old.account_id is not null then
      update public.accounts
      set balance_agorot = balance_agorot - (case when old.kind = 'income' then old.amount_agorot else -old.amount_agorot end),
          captured_at = now()
      where id = old.account_id;
    end if;

    -- Apply new
    if new.account_id is not null then
      update public.accounts
      set balance_agorot = balance_agorot + (case when new.kind = 'income' then new.amount_agorot else -new.amount_agorot end),
          captured_at = now()
      where id = new.account_id;
    end if;
    return new;
  end if;

  return null;
end;
$$;
