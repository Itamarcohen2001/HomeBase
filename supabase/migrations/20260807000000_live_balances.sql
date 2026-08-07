-- ============================================================================
-- HomeBase :: 0016 Update Balances in Real Time
-- ============================================================================

-- 1. Remove the old end-of-month job and function
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pg_cron'
  ) then
    perform cron.unschedule('end-of-month-balance');
  end if;
end $$;

drop function if exists public.apply_end_of_month_balance();

-- 2. Backfill existing balances: Add the transactions that occurred AFTER captured_at
--    Because the end of month script used to only apply transactions of the current month.
update public.accounts a
set balance_agorot = a.balance_agorot + coalesce((
  select sum(
    case 
      when t.kind = 'income' then t.amount_agorot
      when t.kind = 'expense' then -t.amount_agorot
      else 0
    end
  )
  from public.transactions t
  where t.account_id = a.id
    and t.occurred_on > (a.captured_at at time zone 'Israel')::date
), 0);

-- 3. Create the trigger function
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
      set balance_agorot = balance_agorot + (case when new.kind = 'income' then new.amount_agorot else -new.amount_agorot end)
      where id = new.account_id;
    end if;
    return new;
    
  elsif tg_op = 'DELETE' then
    if old.account_id is not null then
      update public.accounts
      set balance_agorot = balance_agorot - (case when old.kind = 'income' then old.amount_agorot else -old.amount_agorot end)
      where id = old.account_id;
    end if;
    return old;
    
  elsif tg_op = 'UPDATE' then
    -- Revert old
    if old.account_id is not null then
      update public.accounts
      set balance_agorot = balance_agorot - (case when old.kind = 'income' then old.amount_agorot else -old.amount_agorot end)
      where id = old.account_id;
    end if;
    
    -- Apply new
    if new.account_id is not null then
      update public.accounts
      set balance_agorot = balance_agorot + (case when new.kind = 'income' then new.amount_agorot else -new.amount_agorot end)
      where id = new.account_id;
    end if;
    return new;
  end if;
  
  return null;
end;
$$;

-- 4. Attach trigger
drop trigger if exists trg_on_transaction_change on public.transactions;
create trigger trg_on_transaction_change
  after insert or update or delete on public.transactions
  for each row execute function public.on_transaction_change();
