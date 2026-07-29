-- 0005: סימון "הוצאה משותפת" על תנועה.
--
-- הוצאה משותפת = הוצאה של כל משק הבית (קניות, חשמל, שכר דירה). בגרף הפיצול
-- בין בני הבית היא מקבלת פרוסה נפרדת בשם "משותף" ואינה נזקפת לאף אדם.
-- `user_id` (מי הזין את התנועה) ממשיך להישמר ולהיות מוצג כרגיל — הסימון
-- משפיע רק על אופן הצגת הפיצול, לא על תיעוד מי רשם.
--
-- אין צורך בשינוי RLS: הפוליסות של transactions נשענות על household_id בלבד
-- (ראה 0002_rls.sql), ולכן עמודה חדשה נכללת בהן אוטומטית.

alter table public.transactions
  add column if not exists is_shared boolean not null default false;

comment on column public.transactions.is_shared is
  'הוצאה של כל משק הבית — מוצגת כפרוסת "משותף" ולא נזקפת לאדם מסוים';

-- שאילתות הניתוח מסננות לפי משק בית + חודש ואז מקבצות לפי is_shared/user_id.
create index if not exists transactions_household_month_shared_idx
  on public.transactions (household_id, period_month, is_shared);
