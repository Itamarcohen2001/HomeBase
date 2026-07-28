-- HomeBase :: 0003 פונקציות RPC (יצירת משק בית, seed קטגוריות, הזמנות, גלגול יעדים, קבועות)

-- ── seed קטגוריות בעברית ────────────────────────────────────────────────────
create or replace function public.seed_default_categories(hid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (household_id, name, icon, color, kind, sort_order)
  values
    (hid, 'סופר ומכולת',     'cart',              '#2E9E6B', 'expense', 10),
    (hid, 'מסעדות וקפה',     'restaurant',        '#E4894F', 'expense', 20),
    (hid, 'דיור ושכירות',    'home',              '#4F7FE4', 'expense', 30),
    (hid, 'חשבונות בית',     'flash',             '#F2C14E', 'expense', 40),
    (hid, 'תחבורה ודלק',     'car',               '#5BC0BE', 'expense', 50),
    (hid, 'בריאות ותרופות',  'medkit',            '#E4646C', 'expense', 60),
    (hid, 'ילדים וחינוך',    'happy',             '#9B6BDF', 'expense', 70),
    (hid, 'ביגוד והנעלה',    'shirt',             '#DE7AA8', 'expense', 80),
    (hid, 'פנאי ובילויים',   'game-controller',   '#3FA7D6', 'expense', 90),
    (hid, 'מנויים ודיגיטל',  'phone-portrait',    '#7A8B99', 'expense', 100),
    (hid, 'ביטוח',           'shield-checkmark',  '#6B8E7B', 'expense', 110),
    (hid, 'מתנות ותרומות',   'gift',              '#C2557A', 'expense', 120),
    (hid, 'חיות מחמד',       'paw',               '#A9743F', 'expense', 130),
    (hid, 'חיסכון והשקעות',  'trending-up',       '#2F8F5B', 'expense', 140),
    (hid, 'שונות',           'ellipsis-horizontal','#8A94A6','expense', 200),
    (hid, 'משכורת',          'briefcase',         '#2E9E6B', 'income',  10),
    (hid, 'עסק עצמאי',       'business',          '#4F7FE4', 'income',  20),
    (hid, 'קצבאות',          'wallet',            '#F2C14E', 'income',  30),
    (hid, 'הכנסה אחרת',      'add-circle',        '#8A94A6', 'income',  40)
  on conflict do nothing;
end;
$$;

-- ── יצירת משק בית חדש (+ חברות owner + seed) ───────────────────────────────
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'משק הבית שלי'), uid)
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, uid, 'owner');

  perform public.seed_default_categories(hid);

  -- כל הזמנה ממתינה לכתובת המייל הזו במשק בית אחר נשארת כפי שהיא
  return hid;
end;
$$;

-- ── הזמנות ─────────────────────────────────────────────────────────────────
create or replace function public.invite_to_household(p_household_id uuid, p_email text)
returns public.household_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not a member of this household';
  end if;

  update public.household_invites
     set status = 'revoked'
   where household_id = p_household_id
     and lower(email) = lower(trim(p_email))
     and status = 'pending';

  insert into public.household_invites (household_id, email, invited_by)
  values (p_household_id, lower(trim(p_email)), auth.uid())
  returning * into inv;

  return inv;
end;
$$;

-- הזמנות ממתינות עבור המשתמש המחובר (לפי המייל שלו)
create or replace function public.my_pending_invites()
returns table (
  invite_id uuid,
  household_id uuid,
  household_name text,
  invited_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.household_id, h.name, p.full_name, i.created_at
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.status = 'pending'
    and i.expires_at > now()
    and lower(i.email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
    and not exists (
      select 1 from public.household_members m
      where m.household_id = i.household_id and m.user_id = auth.uid()
    );
$$;

create or replace function public.accept_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites;
  my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();

  select * into inv from public.household_invites
   where id = p_invite_id and status = 'pending' and expires_at > now();

  if inv.id is null then
    raise exception 'ההזמנה אינה תקפה';
  end if;

  if lower(inv.email) <> lower(coalesce(my_email, '')) then
    raise exception 'ההזמנה אינה מיועדת לכתובת המייל שלך';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  update public.household_invites set status = 'accepted' where id = inv.id;

  return inv.household_id;
end;
$$;

-- ── גלגול יעדים אוטומטי לחודש הנוכחי ───────────────────────────────────────
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

  if exists (select 1 from public.budgets where household_id = p_household_id and month = m) then
    return;
  end if;

  insert into public.budgets (household_id, category_id, month, amount_agorot)
  select household_id, category_id, m, amount_agorot
  from public.budgets
  where household_id = p_household_id and month = prev;
end;
$$;

-- ── הרצת הוצאות/הכנסות קבועות לחודש הנוכחי ─────────────────────────────────
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
    -- מצמידים את היום לחודש (למשל 31 בפברואר → סוף פברואר)
    target := least(
      m + (r.day_of_month - 1),
      (m + interval '1 month - 1 day')::date
    );

    if target <= current_date then
      insert into public.transactions
        (household_id, user_id, category_id, kind, amount_agorot, occurred_on, note, recurring_rule_id)
      values
        (r.household_id, r.created_by, r.category_id, r.kind, r.amount_agorot, target, r.title, r.id)
      on conflict do nothing;

      update public.recurring_rules set last_run_month = m where id = r.id;
      inserted := inserted + 1;
    end if;
  end loop;

  return inserted;
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.seed_default_categories(uuid) to authenticated;
grant execute on function public.invite_to_household(uuid, text) to authenticated;
grant execute on function public.my_pending_invites() to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.rollover_budgets(uuid, date) to authenticated;
grant execute on function public.apply_recurring(uuid) to authenticated;
