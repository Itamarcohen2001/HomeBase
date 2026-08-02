-- 0013 — חשבון התנועות (החלטה 19)
--
-- 🎯 **מה שהמשתמש אמר, וזה מבטל את כל הכיוון הקודם:**
--
--     «אני מכניס למעקב אחר הון את המצב ההתחלתי ומשם אתה עוקב»
--     «לא כל תנועה תשויך לחשבון. כל התנועות יוצאות מהעו"ש,
--      לא משנה מאיזה חשבון»
--     «יש לי כמה חשבונות עו"ש, ואני אסמן אחד כאחראי על התנועות»
--
-- ⇒ אין שיוך פר-תנועה, אין ניחוש מוסדות, ואין התאמת שמות בנקים.
--   יש **חשבון אחד מסומן**, וכל התנועות יורדות ממנו.
--
-- 🔴 **וזה מה שמפעיל מעקב אמיתי במקום צילום.** עד היום `balance_agorot`
--    הוחלף בכל הקלדה, ולכן מי שהקליד פעם אחת ולא חזר — המספר שלו תקוע
--    לנצח והאפליקציה רק צובעת אותו כמיושן. מעכשיו `captured_at` הוא
--    **נקודת מוצא**:
--
--        יתרה נוכחית = balance_agorot
--                    − Σ expense שאחרי captured_at
--                    + Σ income  שאחרי captured_at
--
--    ‏`amount_agorot` תמיד חיובי (`check (amount_agorot > 0)` ב-0001),
--    ולכן **הסימן נגזר מ-`kind`, לעולם לא מהסכום**.

alter table public.accounts
  add column if not exists is_transaction_account boolean not null default false;

comment on column public.accounts.is_transaction_account is
  'החשבון שכל התנועות יורדות ממנו. אחד לכל משק בית. כשאין אחד — מצהירים «לא נבחר חשבון» ולא מנחשים.';

-- 🎯 **אחד בלבד לכל משק בית**, ובאילוץ ולא בקוד: אינדקס ייחודי **חלקי**.
--    אילוץ מלא על (household_id, is_transaction_account) היה אוסר שני
--    חשבונות **לא** מסומנים — כלומר בדיוק המצב הרגיל.
create unique index if not exists accounts_transaction_account_key
  on public.accounts (household_id)
  where is_transaction_account;

-- 🔴 **סימון הוא החלפה, לא הוספה.** בלי זה המשתמש היה מקבל שגיאת
--    אילוץ סתומה במקום החלפת חשבון, ולכן ההחלפה נעשית אטומית בצד השרת.
create or replace function public.set_transaction_account(p_account uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.accounts where id = p_account;
  if v_household is null then
    raise exception 'account not found';
  end if;

  -- מבטלים קודם, אחרת האינדקס החלקי נופל באמצע
  update public.accounts
     set is_transaction_account = false
   where household_id = v_household
     and is_transaction_account
     and id <> p_account;

  update public.accounts
     set is_transaction_account = true
   where id = p_account;
end;
$$;

comment on function public.set_transaction_account(uuid) is
  'מסמן חשבון כאחראי על התנועות ומבטל את הקודם באותה טרנזקציה. RLS של accounts חלה כרגיל (security invoker).';

grant execute on function public.set_transaction_account(uuid) to authenticated;

-- 🎯 שאילתת הצבירה רצה על (משק בית, תאריך) — בדיוק האינדקס שכבר קיים
--    מ-0001 (`transactions_household_date_idx`), ולכן אין צורך בחדש.
