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

// ═══ חשבונות תנועה (לתור אישור חיבור בנקים, ולהוספה ידנית) ══════════════════
//
// 🔴 ענף רדום שנמחק כאן, לא רק תועד. עד ל-0015+live_balances, ל-accounts לא
//    הייתה יתרה חיה — ולכן היה כאן מנגנון "עוגן + צבירת תנועות מאז" שחישב
//    יתרה נוכחית בצד הלקוח (buildBalanceTracking, anchorDate,
//    listTransactionsAfter, setTransactionAccount/clearTransactionAccount
//    שסימנו "חשבון תנועות" גלובלי אחד למשק בית). 0015 מחקה את
//    accounts.is_transaction_account ואת ה-RPC set_transaction_account,
//    ו-live_balances הוסיפה טריגר שמעדכן balance_agorot בזמן אמת בכל
//    insert/update/delete על transactions — כלומר בדיוק מה שהמנגנון הזה
//    חישב ידנית כבר קורה בשרת, תמיד. נמדד: אף מסך לא קורא ל-4 הפונקציות
//    האלה יותר (רק net-worth.tsx עוד קרא ל-listTrackedAccounts+anchorDate
//    בלי להשתמש בתוצאה בכלל — שתי שאילתות מבוזבזות בכל טעינה, גם תוקן).
//    לגרף/דוח היסטורי — התצלום היומי account_snapshots כבר קיים לזה
//    (ראו getNetWorthTrend), לא צריך לבנות מחדש.

export interface TrackedAccount {
  id: string;
  name: string;
  balance_agorot: number;
  captured_at?: string | null;
}

export async function listTrackedAccounts(householdId: string): Promise<TrackedAccount[]> {
  try {
    return unwrap(
      await supabase
        .from('accounts')
        .select('id, name, balance_agorot, captured_at')
        .eq('household_id', householdId)
        .eq('is_archived', false)
        .in('kind', ['bank', 'cash']),
    ) as unknown as TrackedAccount[];
  } catch {
    return [];
  }
}
