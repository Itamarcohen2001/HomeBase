/**
 * שווי נטו — שכבת נתונים.
 *
 * הפיצ'ר תלוי במיגרציה 0010. כל עוד היא לא רצה, `hasNetWorthSchema()`
 * מחזיר false והמסך מציג הסבר בעברית במקום להיכשל — אותה תבנית של
 * `hasSharedColumn` ב-db.ts.
 */
import { supabase } from './supabase';

export type AccountKind = 'bank' | 'brokerage' | 'cash';
export type PriceFeed = 'tase_security' | 'tase_fund' | 'yahoo';

export interface Account {
  id: string;
  household_id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  balance_agorot: number;
  captured_at: string;
  is_archived: boolean;
  /** 🎯 החלטה 19: החשבון שכל התנועות יורדות ממנו. אחד לכל משק בית. */
  is_transaction_account?: boolean | null;
}

export interface AccountValue {
  account_id: string;
  household_id: string;
  name: string;
  kind: AccountKind;
  balance_agorot: number;
  captured_at: string;
  holdings_agorot: number;
  total_agorot: number;
  /** אחזקות בלי מחיר חי **וגם** בלי שווי בדוח — פער מוצהר, לא אפס שקט */
  unpriced_holdings: number;
  /** אחזקות שמוערכות לפי הסכום שהיה בדוח, כי אין להן מחיר חי */
  report_valued_holdings: number;
}

export interface Security {
  id: string;
  external_id: string;
  price_feed: PriceFeed;
  name: string;
  symbol: string | null;
  isin: string | null;
  quote_currency: string;
}

export interface Holding {
  id: string;
  account_id: string;
  security_id: string;
  as_of: string;
  quantity: number;
  stated_value_agorot: number | null;
  stated_share_pct: number | null;
  securities: Security | null;
}

export interface HoldingView extends Holding {
  /** מחיר יחידה באגורות מהתמחור האחרון, או null כשאין */
  ils_price_agorot: number | null;
  price_date: string | null;
  /** השווי שבו המסך משתמש בפועל */
  value_agorot: number | null;
}

export interface CatalogResult {
  external_id: string;
  price_feed: PriceFeed;
  name: string;
  symbol: string | null;
  isin: string | null;
  category: string | null;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/**
 * הסכימה של שווי נטו נוספה במיגרציה 0010. אם היא לא רצה, PostgREST מחזיר
 * 404/42P01 על כל קריאה. מזהים פעם אחת, זוכרים, ומדרגים למטה.
 */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const m = error.message ?? '';
  return /does not exist|could not find the table|schema cache/i.test(m);
}

let schemaState: 'unknown' | 'present' | 'missing' = 'unknown';
let schemaProbe: Promise<boolean> | null = null;

export function hasNetWorthSchema(): Promise<boolean> {
  if (schemaState !== 'unknown') return Promise.resolve(schemaState === 'present');
  if (!schemaProbe) {
    schemaProbe = (async () => {
      const { error } = await supabase.from('accounts').select('id').limit(1);
      schemaState = isMissingSchema(error) ? 'missing' : 'present';
      return schemaState === 'present';
    })();
  }
  return schemaProbe;
}

// ── חשבונות ────────────────────────────────────────────────────────────────

export async function listAccounts(householdId: string): Promise<Account[]> {
  return unwrap(
    await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_archived', false)
      .order('kind')
      .order('name'),
  ) as unknown as Account[];
}

export async function listAccountValues(householdId: string): Promise<AccountValue[]> {
  return unwrap(
    await supabase
      .from('net_worth_by_account')
      .select('*')
      .eq('household_id', householdId),
  ) as unknown as AccountValue[];
}

export async function getLatestPriceFetchTime(): Promise<string | null> {
  const { data } = await supabase
    .from('security_prices')
    .select('fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single();
  return data?.fetched_at ?? null;
}

export interface NetWorthTrendPoint {
  date: string;
  total_agorot: number;
}

export async function getNetWorthTrend(householdId: string): Promise<NetWorthTrendPoint[]> {
  const [snapshotsRes, currentRes] = await Promise.all([
    supabase
      .from('account_snapshots')
      .select('captured_on, total_agorot')
      .eq('household_id', householdId)
      .order('captured_on', { ascending: true }),
    supabase
      .from('net_worth_by_account')
      .select('total_agorot')
      .eq('household_id', householdId)
  ]);

  const rows = unwrap(snapshotsRes) as unknown as { captured_on: string; total_agorot: number }[];
  const currentAccounts = unwrap(currentRes) as unknown as { total_agorot: number }[];

  const byDate = new Map<string, number>();
  for (const r of rows) {
    byDate.set(r.captured_on, (byDate.get(r.captured_on) ?? 0) + r.total_agorot);
  }

  // Add today's current live value if it's not already in the snapshots
  const today = new Date().toISOString().split('T')[0];
  if (!byDate.has(today) && currentAccounts.length > 0) {
    const currentTotal = currentAccounts.reduce((sum, acc) => sum + acc.total_agorot, 0);
    byDate.set(today, currentTotal);
  }

  return Array.from(byDate.entries())
    .map(([date, total_agorot]) => ({ date, total_agorot }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function addAccount(input: {
  householdId: string;
  userId: string;
  name: string;
  kind: AccountKind;
  balanceAgorot: number;
}): Promise<Account> {
  return unwrap(
    await supabase
      .from('accounts')
      .insert({
        household_id: input.householdId,
        created_by: input.userId,
        name: input.name,
        kind: input.kind,
        balance_agorot: input.balanceAgorot,
        captured_at: new Date().toISOString(),
      })
      .select('*')
      .single(),
  ) as unknown as Account;
}

/**
 * עדכון יתרה ידני.
 *
 * 🎯 החלטה 18: זה **תיקון עוגן**. ‏`captured_at` מתעדכן, ולכן הצבירה של
 *    התנועות מתחילה מכאן מחדש — «אני יודע שעכשיו יש 18,785, תמשיך מכאן».
 */
export async function updateAccountBalance(id: string, balanceAgorot: number): Promise<void> {
  unwrap(
    await supabase
      .from('accounts')
      .update({ balance_agorot: balanceAgorot, captured_at: new Date().toISOString() })
      .eq('id', id)
      .select('id'),
  );
}

export async function renameAccount(id: string, name: string): Promise<void> {
  unwrap(await supabase.from('accounts').update({ name }).eq('id', id).select('id'));
}

export async function archiveAccount(id: string): Promise<void> {
  unwrap(await supabase.from('accounts').update({ is_archived: true }).eq('id', id).select('id'));
}

// ── אחזקות ─────────────────────────────────────────────────────────────────

const HOLDING_SELECT =
  '*, securities(id,external_id,price_feed,name,symbol,isin,quote_currency)';

/**
 * האחזקות העדכניות של חשבון, עם המחיר האחרון של כל נייר.
 *
 * 🪤 המפתח הוא (חשבון, נייר, תאריך) ולכן ייתכנו כמה תאריכים לאותו נייר;
 *    שומרים את החדש ביותר בלבד. הסינון נעשה כאן ולא ב-SQL כדי לא לדרוש
 *    view נוסף לכל חשבון.
 */
export async function listHoldings(accountId: string): Promise<HoldingView[]> {
  const rows = unwrap(
    await supabase
      .from('holdings')
      .select(HOLDING_SELECT)
      .eq('account_id', accountId)
      .order('as_of', { ascending: false }),
  ) as unknown as Holding[];

  const latest = new Map<string, Holding>();
  for (const r of rows) if (!latest.has(r.security_id)) latest.set(r.security_id, r);
  const current = [...latest.values()];
  if (!current.length) return [];

  const prices = unwrap(
    await supabase
      .from('security_prices')
      .select('security_id, ils_price_agorot, price_date')
      .in('security_id', current.map((h) => h.security_id))
      .order('price_date', { ascending: false }),
  ) as unknown as { security_id: string; ils_price_agorot: number; price_date: string }[];

  const bySecurity = new Map<string, { ils_price_agorot: number; price_date: string }>();
  for (const p of prices) if (!bySecurity.has(p.security_id)) bySecurity.set(p.security_id, p);

  return current
    .map((h) => {
      const price = bySecurity.get(h.security_id) ?? null;
      // 🔴 המחיר החי גובר על השווי שבדוח — זה הפיצ'ר עצמו. הדוח הוא תצלום
      //    מיום ההורדה, ומשמש רק כשאין מחיר.
      const value =
        price !== null
          ? Math.round(h.quantity * price.ils_price_agorot)
          : h.stated_value_agorot;
      return {
        ...h,
        ils_price_agorot: price?.ils_price_agorot ?? null,
        price_date: price?.price_date ?? null,
        value_agorot: value ?? null,
      };
    })
    .sort((a, b) => (b.value_agorot ?? 0) - (a.value_agorot ?? 0));
}

export async function addHolding(input: {
  householdId: string;
  accountId: string;
  securityId: string;
  quantity: number;
  asOf: string;
  statedValueAgorot?: number | null;
  statedSharePct?: number | null;
}): Promise<void> {
  unwrap(
    await supabase
      .from('holdings')
      .upsert(
        {
          household_id: input.householdId,
          account_id: input.accountId,
          security_id: input.securityId,
          quantity: input.quantity,
          as_of: input.asOf,
          stated_value_agorot: input.statedValueAgorot ?? null,
          stated_share_pct: input.statedSharePct ?? null,
        },
        { onConflict: 'account_id,security_id,as_of' },
      )
      .select('id'),
  );
}

/**
 * מוחק אחזקות של החשבון שאינן ברשימת הניירות שנמסרה.
 *
 * 🔴 בלי זה נייר שנמכר נשאר לנצח: `listHoldings` לוקח את התאריך החדש ביותר
 *    לכל נייר, ולכן שורה ישנה של נייר שכבר לא בתיק תמשיך להיספר בשקט.
 */
export async function deleteHoldingsNotIn(
  accountId: string,
  securityIds: string[],
): Promise<number> {
  const query = supabase.from('holdings').delete().eq('account_id', accountId);
  const filtered = securityIds.length
    ? query.not('security_id', 'in', `(${securityIds.join(',')})`)
    : query;
  const rows = unwrap(await filtered.select('id')) as unknown as { id: string }[];
  return rows.length;
}

export async function deleteHolding(id: string): Promise<void> {
  unwrap(await supabase.from('holdings').delete().eq('id', id).select('id'));
}

// ── Edge Function ──────────────────────────────────────────────────────────
// ל-API של הבורסה אין CORS, ולכן כל קריאה אליו עוברת דרך הפונקציה.

async function callMarketData<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('market-data', { body });
  if (error) throw new Error(error.message);
  const payload = data as { error?: string } & T;
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    throw new Error(String(payload.error));
  }
  return payload as T;
}

export async function refreshPrices(): Promise<{ priced: number; failed: number }> {
  return callMarketData<{ priced: number; failed: number }>({ action: 'refresh' });
}

export async function searchSecurities(query: string): Promise<CatalogResult[]> {
  const res = await callMarketData<{ results: CatalogResult[] }>({ action: 'search', query });
  return res.results ?? [];
}

/**
 * מוסיף נייר לטבלה המקומית ומחזיר את השורה.
 *
 * `price_feed` אופציונלי: מסך החיפוש יודע אותו מהקטלוג, אבל קובץ אחזקות
 * מוסר מספר נייר בלבד — ואז הפונקציה מוצאת אותו לפי המזהה.
 */
export async function resolveSecurity(entry: {
  external_id: string;
  price_feed?: PriceFeed | null;
  name?: string | null;
  symbol?: string | null;
}): Promise<Security> {
  const res = await callMarketData<{ security: Security; matched: boolean }>({
    action: 'resolve',
    external_id: entry.external_id,
    price_feed: entry.price_feed ?? undefined,
    name: entry.name ?? undefined,
    symbol: entry.symbol ?? undefined,
  });
  return res.security;
}

// ── עזרי תצוגה ─────────────────────────────────────────────────────────────

/**
 * חיווי התיישנות. המשתמש ביקש לראות מתי המספר עודכן לאחרונה
 * ולא לקבל מספר שנראה עדכני בלי שהוא כזה.
 */
export function stalenessLabel(capturedAt: string | null): string {
  if (!capturedAt) return 'לא עודכן מעולם';
  const then = new Date(capturedAt).getTime();
  if (!Number.isFinite(then)) return 'לא עודכן מעולם';
  
  // חישוב ימים קלנדריים ולא תקופות של 24 שעות
  const nowObj = new Date();
  nowObj.setHours(0, 0, 0, 0);
  const thenObj = new Date(then);
  thenObj.setHours(0, 0, 0, 0);
  const days = Math.round((nowObj.getTime() - thenObj.getTime()) / 86400000);

  if (days <= 0) return 'עודכן היום';
  if (days === 1) return 'עודכן אתמול';
  if (days === 2) return 'עודכן לפני יומיים';
  if (days < 30) return `עודכן לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'עודכן לפני חודש';
  if (months === 2) return 'עודכן לפני חודשיים';
  return `עודכן לפני ${months} חודשים`;
}

/** האם היתרה ישנה מספיק כדי להזהיר. */
export function isStale(capturedAt: string | null, days = 30): boolean {
  if (!capturedAt) return true;
  const then = new Date(capturedAt).getTime();
  if (!Number.isFinite(then)) return true;
  
  const nowObj = new Date();
  nowObj.setHours(0, 0, 0, 0);
  const thenObj = new Date(then);
  thenObj.setHours(0, 0, 0, 0);
  const diffDays = Math.round((nowObj.getTime() - thenObj.getTime()) / 86400000);
  
  return diffDays >= days;
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: 'חשבון בנק',
  brokerage: 'בית השקעות',
  cash: 'מזומן',
};

// ── התפלגות לפי מחלקת נכס ──────────────────────────────────────────────────

/**
 * מחלקות הגרף. חמש הראשונות מגיעות מהניירות ומהחשבונות; `pending` הוא
 * הכיס — כסף שיצא מהעו"ש כתנועת הון ועוד לא הופיע כאחזקה.
 */
export type AssetClass =
  | 'equity'
  | 'money_market'
  | 'bond'
  | 'cash'
  | 'other'
  | 'checking'
  | 'pending';

export interface AssetClassValue {
  household_id: string;
  asset_class: AssetClass;
  value_agorot: number;
  /** אחזקות בלי מחיר **וגם** בלי שווי בדוח — תרמו 0 ולכן מעוותות אחוזים */
  unpriced_count?: number;
}

/**
 * 🎯 ההתפלגות נגזרת מ-`securities.asset_class` ולא מ-`accounts.kind`.
 *    חשבון בנק אחד מחזיק גם יתרת עו"ש וגם קרן כספית, וגזירה מסוג החשבון
 *    הייתה מציגה את הקרן כ«עו"ש» בשקט, בלי שום שגיאה.
 */
export async function listAssetClassValues(householdId: string): Promise<AssetClassValue[]> {
  return unwrap(
    await supabase
      .from('net_worth_by_asset_class')
      .select('*')
      .eq('household_id', householdId),
  ) as unknown as AssetClassValue[];
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  checking: 'עובר ושב בבנק',
  cash: 'מזומן',
  money_market: 'קרן כספית/פק"מ',
  equity: 'שוק ההון',
  bond: 'אגרות חוב',
  other: 'אחר',
  pending: 'ממתין לשיוך',
};

/** סדר קבוע, כדי שהפרוסות לא יקפצו בין טעינות. */
export const ASSET_CLASS_ORDER: AssetClass[] = [
  'equity',
  'money_market',
  'bond',
  'checking',
  'cash',
  'other',
  'pending',
];

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  equity: '#2F8F5B',
  money_market: '#4F7FE4',
  bond: '#5BC0BE',
  checking: '#7A6BDF',
  cash: '#E4894F',
  other: '#8A94A6',
  // 🔴 אפור בכוונה: הכיס אינו נכס אמיתי אלא הצהרה על משהו שחסר שיוך.
  pending: '#B0B7C3',
};

export interface DistributionSlice {
  key: AssetClass;
  label: string;
  amount: number;
  /** 0–100, מעוגל */
  percent: number;
  color: string;
}

export interface Distribution {
  slices: DistributionSlice[];
  /** מחלקות עם סכום שלילי — מוצהרות בנפרד ולא מצוירות */
  negative: { key: AssetClass; label: string; amount: number }[];
  /** סכום הפרוסות החיוביות בלבד — המכנה של האחוזים */
  sum: number;
  pending: number;
  /**
   * 🔴 אחזקות שאין להן מחיר וגם אין להן שווי בדוח. הן תרמו 0, ולכן
   *    **האחוזים למטה חושבו על בסיס חסר**. פאי מנרמל, ולכן שגיאה כזו
   *    מתפשטת לכל הפרוסות ולא נשארת מקומית — חובה להצהיר עליה.
   */
  unpriced: number;
}

/**
 * בונה את פרוסות גרף ההתפלגות.
 *
 * 🪤 **יתרה שלילית אינה זווית.** נמדד עו"ש של ‎-194129‎; פרוסה שלילית
 *    בדונאט מייצרת קשת הפוכה שמסתירה פרוסות אחרות. לכן מחלקה עם סכום
 *    שלילי יורדת מהגרף ו**מוצהרת** — לא נבלעת בשקט ולא הופכת לאפס.
 * 🔴 `pending` מופיע **רק כשהוא גדול מאפס** (החלטה 15). ה-view כבר מסנן
 *    אפסים, אבל ההגנה כאן היא כדי שהכלל לא יישען על צד אחד בלבד.
 */
export function buildDistribution(rows: AssetClassValue[]): Distribution {
  const byClass = new Map<AssetClass, number>();
  let unpriced = 0;
  for (const r of rows) {
    unpriced += Number(r.unpriced_count ?? 0) || 0;
    const v = Number(r.value_agorot ?? 0);
    if (!Number.isFinite(v)) continue;
    byClass.set(r.asset_class, (byClass.get(r.asset_class) ?? 0) + v);
  }

  const slices: DistributionSlice[] = [];
  const negative: { key: AssetClass; label: string; amount: number }[] = [];
  for (const key of ASSET_CLASS_ORDER) {
    const amount = byClass.get(key);
    if (amount === undefined || amount === 0) continue;
    if (amount < 0) {
      negative.push({ key, label: ASSET_CLASS_LABEL[key], amount });
      continue;
    }
    slices.push({
      key,
      label: ASSET_CLASS_LABEL[key],
      amount,
      percent: 0,
      color: ASSET_CLASS_COLOR[key],
    });
  }

  const sum = slices.reduce((s, p) => s + p.amount, 0);
  for (const s of slices) s.percent = sum > 0 ? Math.round((s.amount / sum) * 100) : 0;

  return { slices, negative, sum, pending: Math.max(0, byClass.get('pending') ?? 0), unpriced };
}

// ── כיס הממתינים לשיוך ─────────────────────────────────────────────────────

export interface PendingAllocation {
  id: string;
  household_id: string;
  transaction_id: string;
  amount_agorot: number;
  account_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

export async function listPendingAllocations(householdId: string): Promise<PendingAllocation[]> {
  return unwrap(
    await supabase
      .from('pending_allocations')
      .select('*')
      .eq('household_id', householdId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false }),
  ) as unknown as PendingAllocation[];
}

/**
 * רושם תנועת הון לכיס.
 *
 * 🔴 בלי זה הכסף **מתאדה**: ההוצאה מקטינה את העו"ש, אבל היא עוד לא הופיעה
 *    כאחזקה, ולכן סך ההון יורד למרות שלא נצרך שקל.
 * ⚠️ `unique (transaction_id)` מונע ספירה כפולה, ולכן שמירה חוזרת של אותה
 *    תנועה אינה מוסיפה שורה שנייה — מתעלמים מהתנגשות במקום להיכשל.
 */
export async function recordPendingAllocation(input: {
  householdId: string;
  transactionId: string;
  amountAgorot: number;
  accountId?: string | null;
}): Promise<void> {
  if (!(input.amountAgorot > 0)) return;
  const { error } = await supabase.from('pending_allocations').upsert(
    {
      household_id: input.householdId,
      transaction_id: input.transactionId,
      amount_agorot: input.amountAgorot,
      account_id: input.accountId ?? null,
    },
    { onConflict: 'transaction_id', ignoreDuplicates: true },
  );
  // הכיס הוא שכבת דיוק, לא תנאי לשמירת התנועה. אם הסכימה עוד לא רצה,
  // התנועה כבר נשמרה ואין סיבה להיכשל מולה.
  if (error && !isMissingSchema(error)) throw new Error(error.message);
}

/** סימון שהכסף הגיע ליעדו — הפרוסה האפורה נעלמת. */
export async function resolvePendingAllocation(id: string, accountId?: string | null): Promise<void> {
  const patch: Record<string, unknown> = { resolved_at: new Date().toISOString() };
  if (accountId !== undefined) patch.account_id = accountId;
  const { error } = await supabase.from('pending_allocations').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePendingAllocation(id: string): Promise<void> {
  const { error } = await supabase.from('pending_allocations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ═══ מעקב יתרה (החלטות 18+19) ═══════════════════════════════════════════════

export type BatchKind = 'bank_statement' | 'credit_report';
export type RefKind = 'account' | 'card';

export interface ImportBatch {
  id: string;
  household_id: string;
  kind: BatchKind;
  source: string;
  /** 🎯 המזהה שהקובץ מצהיר עליו — מפתח השיוך היחיד */
  external_ref: string | null;
  ref_kind: RefKind | null;
  account_id: string | null;
  stated_total_agorot: number | null;
  parsed_total_agorot: number;
  row_count: number;
  occurred_from: string | null;
  occurred_to: string | null;
  statement_date: string | null;
  charge_date: string | null;
  debited_on: string | null;
  imported_at: string;
}

/** שורת חיוב מרוכז מדוח עו"ש. אינה תנועה — היא לא מיובאת במכוון. */
export interface BatchCharge {
  id: string;
  batch_id: string;
  external_ref: string;
  amount_agorot: number;
  occurred_on: string;
}

/**
 * תאריך היתרה כמחרוזת קצרה. החלטה 18 דורשת **תאריך**, לא «לפני N ימים» —
 * העוגן מוצג עם התאריך שלו.
 *
 * 🪤 מקומי בכוונה, כמו `toISODate`. `toISOString` מזיז יום אחורה לכל מי
 *    שנמצא ממזרח ל-UTC, וישראל שם.
 */
export function formatCapturedAt(capturedAt: string | null): string {
  if (!capturedAt) return '';
  const d = new Date(capturedAt);
  if (!Number.isFinite(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export async function listImportBatches(householdId: string): Promise<ImportBatch[]> {
  try {
    return unwrap(
      await supabase
        .from('import_batches')
        .select('*')
        .eq('household_id', householdId)
        .order('imported_at', { ascending: false }),
    ) as unknown as ImportBatch[];
  } catch {
    // סכימה ישנה: אין אצוות ⇒ אין צפי, ולא קריסה
    return [];
  }
}

export async function listBatchCharges(householdId: string): Promise<BatchCharge[]> {
  try {
    return unwrap(
      await supabase.from('import_batch_charges').select('*').eq('household_id', householdId),
    ) as unknown as BatchCharge[];
  } catch {
    return [];
  }
}

// ═══ מעקב יתרה: העוגן והצבירה (החלטות 18+19) ════════════════════════════════

/**
 * 🔴 **הגבול: תנועה בדיוק בתאריך העוגן אינה נספרת.** ההשוואה היא `>`,
 *    לא `>=`, ו**זו החלטה מוצהרת ולא תוצר לוואי**:
 *
 *    · המשתמש עצמו ניסח «אני מכניס את **המצב ההתחלתי** ו**משם** אתה עוקב».
 *      «משם» = אחרי.
 *    · ‏`occurred_on` הוא `date` בלי שעה, ואילו `captured_at` הוא
 *      `timestamptz`. לתנועה מאותו יום **אין** דרך לדעת אם קדמה לקריאת
 *      היתרה או באה אחריה — המידע פשוט לא קיים.
 *    · ומבין שתי הטעויות האפשריות, ספירה כפולה גרועה יותר מהשמטה:
 *      היתרה שהמשתמש מקליד נקראה מאפליקציית הבנק ולכן כבר מכילה את מה
 *      שירד באותו יום. ‏`>=` היה מנכה אותו שוב.
 */
export const ANCHOR_BOUNDARY = 'exclusive' as const;

export interface TrackedAccount {
  id: string;
  name: string;
  balance_agorot: number;
  captured_at?: string | null;
  is_transaction_account?: boolean | null;
}

/** תנועה כפי שהיא ב-DB: הסכום תמיד חיובי, והכיוון יושב ב-`kind`. */
export interface TrackedTransaction {
  kind: 'expense' | 'income';
  amount_agorot: number;
  /** yyyy-mm-dd */
  occurred_on: string;
  /**
   * 🔴 החלטה 20 — שורת חיוב מרוכז שדוח האשראי כבר פירט אותה.
   *    היא נשארת ב-DB (היא קיימת בדוח העו"ש והמשתמש יראה אותה), אבל
   *    **אינה נספרת שוב** — 992.80 של כרטיס 4003 הוא אותו כסף כמו 26
   *    השורות המפורטות.
   */
  supersededByBatchId?: string | null;
}

export type TrackingGap = 'no_schema' | 'no_transaction_account' | 'no_anchor_date';

export interface BalanceTracking {
  /** האם יש מעקב. `false` ⇒ **מצהירים**, לא מנחשים ולא בוחרים חשבון. */
  available: boolean;
  gap?: TrackingGap;
  accountId: string | null;
  accountName: string;
  /** היתרה שהוקלדה — נקודת המוצא */
  anchor: number;
  /** yyyy-mm-dd מקומי של העוגן */
  anchorDate: string | null;
  expense: number;
  income: number;
  /** ‏`income − expense` */
  delta: number;
  /** ‏`anchor + delta` — היתרה הנוכחית */
  current: number;
  /** כמה תנועות נספרו. ‏0 עם `available` אומר «אין תנועות מאז», לא תקלה. */
  counted: number;
}

/**
 * התאריך המקומי של העוגן.
 *
 * 🪤 **לא `toISOString().slice(0,10)`.** ישראל היא UTC+2/+3, ולכן עוגן
 *    שנקבע ב-01:00 היה מוצג ומושווה כיום הקודם — והשוואת הגבול הייתה
 *    סופרת יום שלם של תנועות פעמיים.
 */
export function anchorDate(capturedAt: string | null | undefined): string | null {
  if (!capturedAt) return null;
  // 🎯 **`date` מול `date`, מפורשות.** ‏`occurred_on` הוא `date` ואילו
  //    `captured_at` הוא `timestamptz` (נמדד ב-0010), ולכן ההשוואה חייבת
  //    לרדת ליום. ערך שכבר הוא יום מוחזר **כמות שהוא** ואינו עובר דרך
  //    `Date` כלל — כך אזור הזמן של המכשיר אינו יכול להזיז אותו.
  //
  // 🔴 **אבל צורה אינה תוקף.** הרגקס לבדו היה מחזיר `'2026-13-45'` כמות
  //    שהוא, וההשוואה המחרוזתית `occurred_on > '2026-13-45'` **לעולם לא
  //    יורה** ⇒ אפס תנועות, בלי `gap`, בלי אזהרה. זה היה הופך פער
  //    **מוצהר** לפער **שקט** — בדיוק המחלקה שתוקנה ב-`382312c`.
  //    ⚠️ אינו נגיש היום (`captured_at` הוא `timestamptz not null`), וזה
  //    חיזוק מפני צורת-ערך ולא באג חי — אבל «מצהירים, לא מנחשים» חל גם
  //    על קלט שאמור להיות בלתי אפשרי.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(capturedAt.trim());
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const probe = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    // הלוך-חזור על שלושת השדות: `Date` מגלגל 31/02 ל-03/03, ולכן רק
    // השוואה של כל השלושה תופסת תאריך שאינו קיים.
    const same =
      probe.getUTCFullYear() === Number(y) &&
      probe.getUTCMonth() === Number(m) - 1 &&
      probe.getUTCDate() === Number(d);
    return same ? `${y}-${m}-${d}` : null;
  }
  const d = new Date(capturedAt);
  if (!Number.isFinite(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * החשבון שסומן כאחראי על התנועות.
 *
 * 🔴 מחזיר `null` כשאין סימון — **לא** את החשבון הראשון. למשתמש יש כמה
 *    חשבונות עו"ש; בחירה שרירותית הייתה מייצרת מספר שנראה תקין ומחושב
 *    על החשבון הלא נכון, בלי שום סימן.
 */
export function pickTransactionAccount<T extends { is_transaction_account?: boolean | null }>(
  accounts: T[],
): T | null {
  return accounts.find((a) => Boolean(a.is_transaction_account)) ?? null;
}

/**
 * מעקב יתרה אמיתי (החלטה 18).
 *
 *     יתרה נוכחית = balance_agorot  (בעוגן captured_at)
 *                 − Σ expense  שאחרי captured_at
 *                 + Σ income   שאחרי captured_at
 *
 * 🔴 **הסימן נגזר מ-`kind`, לעולם לא מהסכום.** נמדד ב-`0001_schema.sql`:
 *    ‏`amount_agorot bigint not null check (amount_agorot > 0)`. כל
 *    ניסיון לקרוא כיוון מהסכום היה נותן «כל התנועות הן הכנסה».
 *
 * 🎯 **הקלדה ידנית היא תיקון עוגן**, לא חובה תקופתית: היא מציבה
 *    `captured_at` חדש, ולכן הצבירה מתחילה מאפס («אני יודע שעכשיו יש
 *    18,785 — תמשיך מכאן»).
 *
 * ⚠️ **אין כאן טיפול נפרד בהעברות להשקעות, וזה מכוון.** ‏`is_capital_move`
 *    כבר מחווטת בשני נתיבי הכתיבה (`addTransaction` ו-`addTransactionsBulk`
 *    → `noteCapitalMove` → `recordPendingAllocation`), ולכן העברה להשקעות
 *    היא `expense` רגילה שמקטינה את העו"ש **פעם אחת**, בעוד הסכום מוחזק
 *    בצד ההשקעות. טיפול נוסף כאן היה סופר אותה פעמיים וינפח את ההון.
 *    ⇒ **אל תוסיפו ענף ל-`is_capital_move` בפונקציה הזו.**
 *
 * ⚠️ והגבול הוא `occurred_on`, **לעולם לא** `created_at`: דוח עו"ש מ-31/07
 *    מכיל תנועות מ-02/03, וייבוא רטרואקטיבי לפי מועד הכתיבה היה מנפח את
 *    היתרה בכל ייבוא מחדש.
 */
export function buildBalanceTracking(
  accounts: TrackedAccount[],
  transactions: TrackedTransaction[],
  opts?: { hasSchema?: boolean },
): BalanceTracking {
  const empty = {
    accountId: null,
    accountName: '',
    anchor: 0,
    anchorDate: null,
    expense: 0,
    income: 0,
    delta: 0,
    current: 0,
    counted: 0,
  };

  // 🔴 **בלי 0013 העמודה אינה קיימת, ה-select נכשל, ו-`listTrackedAccounts`
  //    מחזיר `[]`** — שזה בדיוק מה שמתקבל גם כשהסכימה קיימת ואין סימון.
  //    מדדתי ששני המצבים היו **בלתי נבדלים**, ולכן המסך היה שולח את
  //    המשתמש לסמן חשבון — פעולה שנכשלת, כי גם ה-RPC אינו קיים. פער
  //    מוצהר חייב להצהיר על **הסיבה הנכונה**.
  if (opts?.hasSchema === false) return { available: false, gap: 'no_schema', ...empty };

  const account = pickTransactionAccount(accounts);
  // 🔴 אין חשבון מסומן ⇒ מצהירים. המסך יציג «לא נבחר חשבון לתנועות».
  if (!account) return { available: false, gap: 'no_transaction_account', ...empty };

  const anchor = Number(account.balance_agorot ?? 0) || 0;
  const from = anchorDate(account.captured_at);
  const base = {
    ...empty,
    accountId: account.id,
    accountName: account.name ?? '',
    anchor,
    anchorDate: from,
    current: anchor,
  };

  // אין תאריך עוגן ⇒ אין ממה לצבור. מציגים את היתרה כמות שהיא ומצהירים.
  if (!from) return { available: false, gap: 'no_anchor_date', ...base };

  let expense = 0;
  let income = 0;
  let counted = 0;
  for (const t of transactions) {
    // 🔴 `>` ולא `>=` — ראו ANCHOR_BOUNDARY
    if (!t.occurred_on || t.occurred_on <= from) continue;
    // 🔴 החלטה 20: שורה שדוח האשראי כבר פירט אותה אינה הוצאה נוספת.
    //    ⚠️ הסינון כאן, ולא רק ב-`.is(...)` בשרת, כדי שהכלל יהיה **טהור
    //    וניתן למדידה** בלי DB — וכדי שסכימה ישנה לא תשתיק אותו בשקט.
    if (t.supersededByBatchId) continue;
    const amount = Math.abs(Number(t.amount_agorot ?? 0)) || 0;
    if (!amount) continue;
    if (t.kind === 'income') income += amount;
    else if (t.kind === 'expense') expense += amount;
    else continue;
    counted += 1;
  }

  const delta = income - expense;
  return { ...base, available: true, expense, income, delta, current: anchor + delta, counted };
}

/**
 * האם מיגרציה 0013 רצה.
 *
 * 🔴 נפרד מ-`hasNetWorthSchema`: 0010 יכולה לרוץ בלי 0013, וזה בדיוק המצב
 *    בפרודקשן עד שהמיגרציה נמסרת. בלי ההבחנה הזו «אין חשבון מסומן»
 *    ו«העמודה לא קיימת» נראים זהים, והמשתמש נשלח לפעולה שתיכשל.
 */
let trackingState: 'unknown' | 'present' | 'missing' = 'unknown';
let trackingProbe: Promise<boolean> | null = null;

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // ‏42703 = undefined_column · PGRST204 = לא נמצא ב-schema cache
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /is_transaction_account/i.test(error.message ?? '');
}

export function hasTransactionAccountColumn(): Promise<boolean> {
  if (trackingState !== 'unknown') return Promise.resolve(trackingState === 'present');
  if (!trackingProbe) {
    trackingProbe = (async () => {
      const { error } = await supabase.from('accounts').select('is_transaction_account').limit(1);
      trackingState = error && (isMissingColumn(error) || isMissingSchema(error)) ? 'missing' : 'present';
      return trackingState === 'present';
    })();
  }
  return trackingProbe;
}

/** חשבונות הבנק, עם הסימון של חשבון התנועות. */
export async function listTrackedAccounts(householdId: string): Promise<TrackedAccount[]> {
  if (!(await hasTransactionAccountColumn())) return [];
  try {
    return unwrap(
      await supabase
        .from('accounts')
        .select('id, name, balance_agorot, captured_at, is_transaction_account')
        .eq('household_id', householdId)
        .eq('is_archived', false)
        .eq('kind', 'bank'),
    ) as unknown as TrackedAccount[];
  } catch {
    // סכימה בלי 0013 ⇒ אין מעקב, ולא קריסה
    return [];
  }
}

/**
 * התנועות שאחרי העוגן.
 *
 * 🎯 נשלפות מהשרת עם הסינון, ולא מסוננות בלקוח: משק בית ותיק צובר
 *    אלפי תנועות, והעוגן חותך אותן לימים ספורים.
 *
 * 🔴 **`superseded_by_batch_id` נשלף, ואינו מסונן בשרת בלבד.** אילו הסינון
 *    היה רק `.is(...)`, סכימה בלי החלק השני של `0012` הייתה מחזירה `42703`,
 *    ה-catch היה מחזיר `[]`, והמעקב היה מציג את העוגן בלבד **בלי להצהיר
 *    על כך** — בדיוק כשל השקט של `no_schema` שכבר תפסתי פעם אחת.
 *    לכן: ניסיון עם העמודה, ונסיגה מפורשת בלעדיה.
 */
export async function listTransactionsAfter(
  householdId: string,
  from: string,
): Promise<TrackedTransaction[]> {
  const base = (cols: string) =>
    supabase
      .from('transactions')
      .select(cols)
      .eq('household_id', householdId)
      .gt('occurred_on', from);
  try {
    const withCol = await base('kind, amount_agorot, occurred_on, superseded_by_batch_id');
    if (!withCol.error) {
      return ((withCol.data ?? []) as unknown as {
        kind: 'expense' | 'income';
        amount_agorot: number;
        occurred_on: string;
        superseded_by_batch_id: string | null;
      }[]).map((t) => ({
        kind: t.kind,
        amount_agorot: t.amount_agorot,
        occurred_on: t.occurred_on,
        supersededByBatchId: t.superseded_by_batch_id,
      }));
    }
    return unwrap(await base('kind, amount_agorot, occurred_on')) as unknown as TrackedTransaction[];
  } catch {
    return [];
  }
}

/** מסמן חשבון כאחראי על התנועות ומבטל את הקודם באותה טרנזקציה. */
export async function setTransactionAccount(accountId: string): Promise<void> {
  const { error } = await supabase.rpc('set_transaction_account', { p_account: accountId });
  if (error) throw new Error(error.message);
}

/**
 * מבטל את הסימון.
 *
 * 🎯 מותר, ומכוון: אחריו המסך **מצהיר** «לא נבחר חשבון לתנועות» ומציג
 *    את היתרה שהוקלדה בלבד. עדיף על מעקב שרץ על החשבון הלא נכון.
 */
export async function clearTransactionAccount(accountId: string): Promise<void> {
  unwrap(
    await supabase
      .from('accounts')
      .update({ is_transaction_account: false })
      .eq('id', accountId)
      .select('id'),
  );
}
