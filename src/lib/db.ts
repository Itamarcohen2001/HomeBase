import { supabase } from './supabase';
import { monthEnd, monthStart } from './format';
import type {
  Budget,
  Category,
  CategoryProgress,
  Household,
  HouseholdMember,
  Invite,
  Kind,
  MonthSummary,
  PendingInvite,
  Profile,
  RecurringRule,
  Transaction,
} from './types';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ── משקי בית ────────────────────────────────────────────────────────────────

export async function listMyHouseholds(): Promise<Household[]> {
  const rows = unwrap(
    await supabase
      .from('household_members')
      .select('households(*)')
      .order('joined_at', { ascending: true }),
  ) as unknown as { households: Household }[];
  return rows.map((r) => r.households).filter(Boolean);
}

export async function createHousehold(name: string): Promise<string> {
  return unwrap(await supabase.rpc('create_household', { p_name: name })) as unknown as string;
}

export async function renameHousehold(householdId: string, name: string): Promise<void> {
  unwrap(await supabase.from('households').update({ name }).eq('id', householdId).select('id'));
}

export async function listMembers(householdId: string): Promise<HouseholdMember[]> {
  const rows = unwrap(
    await supabase
      .from('household_members')
      .select('*')
      .eq('household_id', householdId)
      .order('joined_at'),
  ) as unknown as HouseholdMember[];
  return attachProfiles(rows);
}

/**
 * transactions.user_id / household_members.user_id reference auth.users, which
 * PostgREST cannot traverse into public.profiles, so `profiles(...)` embedding
 * fails with "Could not find a relationship". Resolving the profiles in a
 * second query keeps the "מי רשם" label working on any existing database.
 */
async function attachProfiles<T extends { user_id: string | null }>(rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
  if (!ids.length) return rows;

  const profiles = unwrap(
    await supabase.from('profiles').select('id,full_name,email,avatar_url').in('id', ids),
  ) as unknown as Profile[];

  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, profiles: r.user_id ? byId.get(r.user_id) ?? null : null }));
}

export async function leaveHousehold(householdId: string, userId: string): Promise<void> {
  unwrap(
    await supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', userId)
      .select('id'),
  );
}

// ── הזמנות ──────────────────────────────────────────────────────────────────

export async function listInvites(householdId: string): Promise<Invite[]> {
  return unwrap(
    await supabase
      .from('household_invites')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false }),
  ) as unknown as Invite[];
}

export async function inviteMember(householdId: string, email: string): Promise<Invite> {
  return unwrap(
    await supabase.rpc('invite_to_household', { p_household_id: householdId, p_email: email }),
  ) as unknown as Invite;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  unwrap(
    await supabase.from('household_invites').update({ status: 'revoked' }).eq('id', inviteId).select('id'),
  );
}

export async function myPendingInvites(): Promise<PendingInvite[]> {
  return (unwrap(await supabase.rpc('my_pending_invites')) as unknown as PendingInvite[]) ?? [];
}

export async function acceptInvite(inviteId: string): Promise<string> {
  return unwrap(await supabase.rpc('accept_invite', { p_invite_id: inviteId })) as unknown as string;
}

// ── קטגוריות ────────────────────────────────────────────────────────────────

export async function listCategories(householdId: string): Promise<Category[]> {
  return unwrap(
    await supabase
      .from('categories')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_archived', false)
      .order('kind')
      .order('sort_order')
      .order('name'),
  ) as unknown as Category[];
}

export async function createCategory(
  householdId: string,
  input: { name: string; icon: string; color: string; kind: Kind },
): Promise<Category> {
  return unwrap(
    await supabase
      .from('categories')
      .insert({ household_id: householdId, ...input })
      .select('*')
      .single(),
  ) as unknown as Category;
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'kind'>>,
): Promise<void> {
  unwrap(await supabase.from('categories').update(patch).eq('id', id).select('id'));
}

export async function deleteCategory(id: string): Promise<void> {
  unwrap(await supabase.from('categories').delete().eq('id', id).select('id'));
}

// ── תנועות ──────────────────────────────────────────────────────────────────

export async function addTransaction(input: {
  householdId: string;
  userId: string;
  categoryId: string | null;
  kind: Kind;
  amountAgorot: number;
  occurredOn: string;
  note?: string | null;
}): Promise<Transaction> {
  return unwrap(
    await supabase
      .from('transactions')
      .insert({
        household_id: input.householdId,
        user_id: input.userId,
        category_id: input.categoryId,
        kind: input.kind,
        amount_agorot: input.amountAgorot,
        occurred_on: input.occurredOn,
        note: input.note ?? null,
      })
      .select('*')
      .single(),
  ) as unknown as Transaction;
}

export async function updateTransaction(
  id: string,
  patch: Partial<{
    category_id: string | null;
    amount_agorot: number;
    occurred_on: string;
    note: string | null;
    kind: Kind;
  }>,
): Promise<void> {
  unwrap(await supabase.from('transactions').update(patch).eq('id', id).select('id'));
}

export async function deleteTransaction(id: string): Promise<void> {
  unwrap(await supabase.from('transactions').delete().eq('id', id).select('id'));
}

const TX_SELECT = '*, categories(id,name,icon,color)';

export async function listTransactions(
  householdId: string,
  opts: { month?: string; limit?: number } = {},
): Promise<Transaction[]> {
  let q = supabase
    .from('transactions')
    .select(TX_SELECT)
    .eq('household_id', householdId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (opts.month) q = q.gte('occurred_on', opts.month).lte('occurred_on', monthEnd(opts.month));
  if (opts.limit) q = q.limit(opts.limit);

  const rows = unwrap(await q) as unknown as Transaction[];
  return attachProfiles(rows);
}

// ── יעדים ───────────────────────────────────────────────────────────────────

export async function listBudgets(householdId: string, month: string): Promise<Budget[]> {
  return unwrap(
    await supabase.from('budgets').select('*').eq('household_id', householdId).eq('month', month),
  ) as unknown as Budget[];
}

export async function setBudget(
  householdId: string,
  month: string,
  categoryId: string | null,
  amountAgorot: number,
): Promise<void> {
  const existing = unwrap(
    await supabase
      .from('budgets')
      .select('id')
      .eq('household_id', householdId)
      .eq('month', month)
      .filter('category_id', categoryId ? 'eq' : 'is', categoryId ?? null),
  ) as unknown as { id: string }[];

  if (amountAgorot <= 0) {
    if (existing.length) {
      unwrap(await supabase.from('budgets').delete().eq('id', existing[0].id).select('id'));
    }
    return;
  }

  if (existing.length) {
    unwrap(
      await supabase
        .from('budgets')
        .update({ amount_agorot: amountAgorot })
        .eq('id', existing[0].id)
        .select('id'),
    );
  } else {
    unwrap(
      await supabase
        .from('budgets')
        .insert({
          household_id: householdId,
          month,
          category_id: categoryId,
          amount_agorot: amountAgorot,
        })
        .select('id'),
    );
  }
}

/** מגלגל את יעדי החודש הקודם לחודש הנוכחי אם עדיין אין יעדים */
export async function rolloverBudgets(householdId: string, month = monthStart()): Promise<void> {
  const { error } = await supabase.rpc('rollover_budgets', {
    p_household_id: householdId,
    p_month: month,
  });
  if (error) throw new Error(error.message);
}

// ── קבועות ──────────────────────────────────────────────────────────────────

export async function listRecurring(householdId: string): Promise<RecurringRule[]> {
  return unwrap(
    await supabase
      .from('recurring_rules')
      .select('*, categories(id,name,icon,color)')
      .eq('household_id', householdId)
      .order('day_of_month'),
  ) as unknown as RecurringRule[];
}

export async function upsertRecurring(input: {
  id?: string;
  householdId: string;
  categoryId: string | null;
  kind: Kind;
  title: string;
  amountAgorot: number;
  dayOfMonth: number;
  isActive: boolean;
  createdBy: string;
}): Promise<void> {
  const payload = {
    household_id: input.householdId,
    category_id: input.categoryId,
    kind: input.kind,
    title: input.title,
    amount_agorot: input.amountAgorot,
    day_of_month: input.dayOfMonth,
    is_active: input.isActive,
    created_by: input.createdBy,
  };
  if (input.id) {
    unwrap(await supabase.from('recurring_rules').update(payload).eq('id', input.id).select('id'));
  } else {
    unwrap(await supabase.from('recurring_rules').insert(payload).select('id'));
  }
}

export async function toggleRecurring(id: string, isActive: boolean): Promise<void> {
  unwrap(await supabase.from('recurring_rules').update({ is_active: isActive }).eq('id', id).select('id'));
}

export async function deleteRecurring(id: string): Promise<void> {
  unwrap(await supabase.from('recurring_rules').delete().eq('id', id).select('id'));
}

export async function applyRecurring(householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc('apply_recurring', { p_household_id: householdId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ── סיכום חודשי ─────────────────────────────────────────────────────────────

export function buildSummary(
  month: string,
  categories: Category[],
  budgets: Budget[],
  transactions: Transaction[],
): MonthSummary {
  const spentBy = new Map<string, number>();
  let income = 0;
  let expense = 0;

  for (const t of transactions) {
    if (t.kind === 'income') {
      income += t.amount_agorot;
    } else {
      expense += t.amount_agorot;
      if (t.category_id) spentBy.set(t.category_id, (spentBy.get(t.category_id) ?? 0) + t.amount_agorot);
    }
  }

  const budgetBy = new Map<string, number>();
  let overallBudget = 0;
  for (const b of budgets) {
    if (b.category_id) budgetBy.set(b.category_id, b.amount_agorot);
    else overallBudget = b.amount_agorot;
  }

  const byCategory: CategoryProgress[] = categories
    .filter((c) => c.kind === 'expense')
    .map((category) => ({
      category,
      spent: spentBy.get(category.id) ?? 0,
      budget: budgetBy.get(category.id) ?? 0,
    }))
    .filter((c) => c.budget > 0 || c.spent > 0)
    .sort((a, b) => {
      const ra = a.budget > 0 ? a.spent / a.budget : Number.MAX_SAFE_INTEGER;
      const rb = b.budget > 0 ? b.spent / b.budget : Number.MAX_SAFE_INTEGER;
      return rb - ra;
    });

  const effectiveBudget = overallBudget > 0 ? overallBudget : income;
  const balance = income - expense;

  return {
    month,
    income,
    expense,
    balance,
    overallBudget,
    remaining: effectiveBudget - expense,
    savingRate: income > 0 ? Math.round((balance / income) * 100) : 0,
    byCategory,
  };
}

export async function loadMonth(householdId: string, month: string) {
  const [categories, budgets, transactions] = await Promise.all([
    listCategories(householdId),
    listBudgets(householdId, month),
    listTransactions(householdId, { month }),
  ]);
  return { categories, budgets, transactions, summary: buildSummary(month, categories, budgets, transactions) };
}
