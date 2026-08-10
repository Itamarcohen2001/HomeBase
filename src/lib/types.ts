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
  /**
   * תנועת הון: הכסף עובר בין חשבונות ולא נצרך.
   * 🔴 הקוד בודק את **הדגל** ולא את שם הקטגוריה — המשתמש יכול לשנות שם.
   * אופציונלי כי העמודה נוספה במיגרציה 0011; לפניה היא פשוט חסרה.
   */
  is_capital_move?: boolean;
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
  account_id?: string | null;
  created_at: string;
  /**
   * הוצאה של כל משק הבית. בגרף הפיצול בין בני הבית היא מקבלת פרוסה נפרדת
   * ("משותף") ואינה נזקפת ל-user_id — אבל user_id עצמו נשמר ומוצג כרגיל.
   * אופציונלי כי מסד נתונים שטרם הריץ את מיגרציה 0005 לא מחזיר את העמודה.
   */
  is_shared?: boolean | null;
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
  account_id?: string | null;
  /** קיים רק אחרי מיגרציה 0007 — כל תנועה שתיווצר מהכלל תסומן כמשותפת */
  is_shared?: boolean | null;
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

/** פרוסה בגרף הניתוח — משמשת גם לפיצול לפי קטגוריה וגם לפיצול לפי אדם */
export type AnalysisSlice = {
  /** מזהה יציב לפרוסה: מזהה קטגוריה, מזהה משתמש, 'shared' או 'unknown' */
  key: string;
  label: string;
  amount: number;
  /** 0–100, מעוגל. סכום כל האחוזים מנורמל ל-100 */
  percent: number;
  color: string;
  icon?: string;
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

// ── חיבור בנקים (סנכרון אוטומטי) ────────────────────────────────────────────
/**
 * מטא-דאטה על חיבור בנק. אינה מכילה סיסמאות — אלה נשארות מוצפנות (DPAPI)
 * במחשב שמריץ את הגירוד המקומי (bank-sync/), ואף פעם לא מגיעות ל-Supabase.
 */
export type BankConnection = {
  id: string;
  household_id: string;
  institution: string;
  nickname: string;
  account_id: string | null;
  status: 'pending_setup' | 'ok' | 'error';
  last_synced_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
};

/** תנועה שנגרדה וממתינה לאישור — ראו approve_bank_pending/reject_bank_pending. */
export type BankSyncPending = {
  id: string;
  household_id: string;
  connection_id: string;
  external_id: string;
  occurred_on: string;
  amount_agorot: number;
  kind: Kind;
  description: string | null;
  suggested_category_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  categories?: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null;
};
