-- ============================================================================
-- HomeBase :: סגירת חודש — עדכון יתרת העו"ש
-- ============================================================================

-- הפונקציה הזו תרוץ פעם בחודש ותעדכן את היתרה של חשבון התנועות.

create or replace function public.apply_end_of_month_balance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h_id uuid;
  t_account_id uuid;
  current_balance bigint;
  delta_agorot bigint;
begin
  -- עבור כל משק בית
  for h_id in select id from public.households loop
    
    -- מצא את חשבון התנועות של משק הבית
    select id, balance_agorot into t_account_id, current_balance
    from public.accounts
    where household_id = h_id
      and is_transaction_account = true
      and is_archived = false
    limit 1;

    if t_account_id is not null then
      
      -- חשב את הדלתא של החודש הנוכחי (הכנסות - הוצאות)
      select coalesce(sum(
        case 
          when t.type = 'income' then t.amount_agorot
          when t.type = 'expense' then -t.amount_agorot
          else 0
        end
      ), 0) into delta_agorot
      from public.transactions t
      where t.household_id = h_id
        and date_trunc('month', t.occurred_on::timestamp) = date_trunc('month', now() at time zone 'Israel');

      -- עדכן את יתרת חשבון התנועות אם יש דלתא
      if delta_agorot <> 0 then
        update public.accounts
        set balance_agorot = balance_agorot + delta_agorot,
            captured_at = now()
        where id = t_account_id;
        
        -- איפוס / תנועה: כרגע הבקשה היא רק לעדכן את היתרה בבנק.
      end if;

    end if;
  end loop;
end;
$$;

-- יצירת ג'וב קרון שירוץ כל יום ב-20:00 ויבדוק אם זה היום האחרון של החודש
-- אם כן, יפעיל את הפונקציה. (דורש pg_cron מופעל)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('end-of-month-balance');
  
  -- אנחנו נריץ כל ערב ב-20:00 שעון ישראל (17:00 או 18:00 UTC)
  -- בתוך הפונקציה, נוודא שזה היום האחרון בחודש:
  -- אבל כדי שזה יהיה פשוט יותר, נוסיף בדיקה קטנה בג'וב עצמו:
  perform cron.schedule('end-of-month-balance', '0 17 * * *', 
    $q$ 
      do $inner$
      begin
        -- אם מחר זה ה-1 לחודש, משמע היום זה היום האחרון לחודש
        if extract(day from (now() at time zone 'Israel' + interval '1 day')) = 1 then
          perform public.apply_end_of_month_balance();
        end if;
      end;
      $inner$;
    $q$
  );
end $$;
