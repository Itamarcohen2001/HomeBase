-- 0008 — סימון רטרואקטיבי של תנועות מיובאות כמשותפות
--
-- הרקע: מ-30/07/2026 כל תנועה שמיובאת מקובץ אשראי נחשבת הוצאה משותפת,
-- כי מדוח בנק אי אפשר לדעת מי מבני הבית ביצע את החיוב.
-- התנועות שיובאו לפני השינוי נשמרו עם is_shared=false ונזקפות למי שייבא.
--
-- 🔑 איך מזהים "מיובא" בלי עמודת מקור:
-- ב-created_at. ברירת המחדל היא now(), ש-*יציבה בתוך טרנזקציה*, ולכן
-- INSERT מרובה-שורות אחד (זה בדיוק מה ש-addTransactionsBulk עושה) נותן
-- לכל השורות חותמת זמן זהה עד המיקרו-שנייה. הזנה ידנית היא בקשת HTTP
-- נפרדת ⇒ טרנזקציה נפרדת ⇒ חותמת שונה. אין דרך ששתי הזנות ידניות
-- ייפלו על אותה מיקרו-שנייה.
--
-- אומת בפרודקשן לפני כתיבת הקובץ (files/coord-import-signature.mjs, 8/8):
--   ייבוא של 5 שורות  → 1 חותמת ייחודית
--   3 הזנות ידניות     → 3 חותמות ייחודיות
--   הקריטריון בחר בדיוק את 5 שורות הייבוא ואפס ידניות
--
-- ⚠️ apply_recurring גם הוא כותב כמה שורות בטרנזקציה אחת. הוא מוחרג
-- במפורש דרך recurring_rule_id is not null — להוצאה קבועה כבר יש
-- is_shared משלה מכלל ה-recurring (מיגרציה 0007), ואסור לדרוס אותו.

begin;

-- דוח לפני: כמה שורות עומדות להשתנות, ובאילו קבוצות
do $$
declare
  n_groups int;
  n_rows   int;
begin
  select count(*), coalesce(sum(c), 0) into n_groups, n_rows
  from (
    select count(*) as c
    from public.transactions
    where kind = 'expense'
      and is_shared = false
      and recurring_rule_id is null
    group by household_id, user_id, created_at
    having count(*) >= 2
  ) g;
  raise notice 'ייבואים שזוהו: % · שורות שיסומנו כמשותפות: %', n_groups, n_rows;
end $$;

update public.transactions t
set is_shared = true
where t.kind = 'expense'
  and t.is_shared = false
  and t.recurring_rule_id is null
  and exists (
    select 1
    from public.transactions p
    where p.household_id = t.household_id
      and p.user_id is not distinct from t.user_id
      and p.created_at = t.created_at
      and p.recurring_rule_id is null
      and p.kind = 'expense'
      and p.id <> t.id
  );

commit;

-- בדיקה ידנית אחרי ההרצה — אמור להחזיר שורות עם is_shared = true:
--   select occurred_on, note, amount_agorot, is_shared
--   from public.transactions
--   where recurring_rule_id is null
--   order by created_at desc, occurred_on
--   limit 40;
