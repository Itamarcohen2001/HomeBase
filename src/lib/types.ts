export type Kind = 'expense' | 'income';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type Household = {
  id: string;
  name: string;
  currency: string;
  created_by: string | null;
  created_at: string;
};

export type HouseholdMember = {
  id: string;
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profiles?: Profile | null;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
  icon: string;
  color: string;
  kind: Kind;
  sort_order: number;
  is_archived: boolean;
};

export type Budget = {
  id: string;
  household_id: string;
  category_id: string | null;
  month: string;
  amount_agorot: number;
};

export type Transaction = {
  id: string;
  household_id: string;
  user_id: string | null;
  category_id: string | null;
  kind: Kind;
  amount_agorot: number;
  occurred_on: string;
  note: string | null;
  recurring_rule_id: string | null;
  created_at: string;
  categories?: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

export type RecurringRule = {
  id: string;
  household_id: string;
  category_id: string | null;
  kind: Kind;
  title: string;
  amount_agorot: number;
  day_of_month: number;
  is_active: boolean;
  last_run_month: string | null;
  categories?: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null;
};

export type Invite = {
  id: string;
  household_id: string;
  email: string;
  token: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
};

export type PendingInvite = {
  invite_id: string;
  household_id: string;
  household_name: string;
  invited_by_name: string | null;
  created_at: string;
};

export type CategoryProgress = {
  category: Category;
  spent: number;
  budget: number;
};

export type MonthSummary = {
  month: string;
  income: number;
  expense: number;
  balance: number;
  overallBudget: number;
  remaining: number;
  savingRate: number;
  byCategory: CategoryProgress[];
};
