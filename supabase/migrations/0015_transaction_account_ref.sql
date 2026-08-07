-- 0015_transaction_account_ref.sql
-- מחיקת "חשבון תנועות" גלובלי ושיוך ישיר של תנועות והוצאות קבועות לחשבונות

-- 1. Add account_id to transactions and recurring_rules
alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete restrict;

alter table public.recurring_rules
  add column if not exists account_id uuid references public.accounts(id) on delete restrict;

-- 2. Backfill existing transactions and recurring rules with the household's transaction account
update public.transactions t
set account_id = a.id
from public.accounts a
where a.household_id = t.household_id
  and a.is_transaction_account = true
  and t.account_id is null;

update public.recurring_rules r
set account_id = a.id
from public.accounts a
where a.household_id = r.household_id
  and a.is_transaction_account = true
  and r.account_id is null;

-- 3. Drop unique index and column
drop index if exists accounts_transaction_account_key;
alter table public.accounts
  drop column if exists is_transaction_account;

-- 4. Drop set_transaction_account function
drop function if exists public.set_transaction_account(uuid);

-- 5. Update end of month function
create or replace function public.apply_end_of_month_balance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h_id uuid;
  acc_record record;
  delta_agorot bigint;
begin
  -- עבור כל משק בית
  for h_id in select id from public.households loop
    
    -- עבור כל חשבון במשק הבית שאינו מאורכב
    for acc_record in 
      select id, balance_agorot 
      from public.accounts 
      where household_id = h_id 
        and is_archived = false 
    loop
      -- חשב את הדלתא של החשבון לחודש הנוכחי
      -- תוקן t.type ל-t.kind כפי שמוגדר בסכימה 0001
      select coalesce(sum(
        case 
          when t.kind = 'income' then t.amount_agorot
          when t.kind = 'expense' then -t.amount_agorot
          else 0
        end
      ), 0) into delta_agorot
      from public.transactions t
      where t.account_id = acc_record.id
        and date_trunc('month', t.occurred_on::timestamp) = date_trunc('month', now() at time zone 'Israel');

      -- עדכן את היתרה של החשבון אם יש דלתא
      if delta_agorot <> 0 then
        update public.accounts
        set balance_agorot = balance_agorot + delta_agorot,
            captured_at = now()
        where id = acc_record.id;
      end if;
    end loop;
  end loop;
end;
$$;
