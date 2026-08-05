-- Add fetched_at to the net_worth_by_account view to reflect stock market updates

create or replace view public.net_worth_by_account
with (security_invoker = on) as
with latest_holdings as (
  select distinct on (h.account_id, h.security_id)
    h.household_id, h.account_id, h.security_id, h.quantity,
    h.stated_value_agorot, h.as_of
  from public.holdings h
  order by h.account_id, h.security_id, h.as_of desc
),
latest_prices as (
  select distinct on (p.security_id)
    p.security_id, p.ils_price_agorot, p.price_date, p.fetched_at
  from public.security_prices p
  order by p.security_id, p.price_date desc
),
valued as (
  select
    lh.household_id,
    lh.account_id,
    case
      when lp.ils_price_agorot is not null
        then round(lh.quantity * lp.ils_price_agorot)::bigint
      else lh.stated_value_agorot
    end as value_agorot,
    (lp.ils_price_agorot is null and lh.stated_value_agorot is null) as is_unpriced,
    (lp.ils_price_agorot is null and lh.stated_value_agorot is not null) as is_stale_from_report,
    lp.fetched_at
  from latest_holdings lh
  left join latest_prices lp on lp.security_id = lh.security_id
)
select
  a.id as account_id,
  a.household_id,
  a.name,
  a.kind,
  a.balance_agorot,
  greatest(a.captured_at, max(v.fetched_at)) as captured_at,
  coalesce(sum(v.value_agorot), 0)::bigint as holdings_agorot,
  (a.balance_agorot + coalesce(sum(v.value_agorot), 0))::bigint as total_agorot,
  coalesce(count(*) filter (where v.is_unpriced), 0)::int as unpriced_holdings,
  coalesce(count(*) filter (where v.is_stale_from_report), 0)::int as report_valued_holdings
from public.accounts a
left join valued v on v.account_id = a.id
where a.is_archived = false
group by a.id, a.household_id, a.name, a.kind, a.balance_agorot, a.captured_at;
