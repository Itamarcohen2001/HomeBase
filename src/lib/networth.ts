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
  institution: string | null;
  currency: string;
  balance_agorot: number;
  captured_at: string;
  is_archived: boolean;
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

export async function addAccount(input: {
  householdId: string;
  userId: string;
  name: string;
  kind: AccountKind;
  institution?: string | null;
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
        institution: input.institution ?? null,
        balance_agorot: input.balanceAgorot,
        captured_at: new Date().toISOString(),
      })
      .select('*')
      .single(),
  ) as unknown as Account;
}

/** עדכון יתרה ידני. `captured_at` מתעדכן תמיד, כי ממנו נגזר חיווי ההתיישנות. */
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
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'עודכן היום';
  if (days === 1) return 'עודכן אתמול';
  if (days < 30) return `עודכן לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'עודכן לפני חודש' : `עודכן לפני ${months} חודשים`;
}

/** האם היתרה ישנה מספיק כדי להזהיר. */
export function isStale(capturedAt: string | null, days = 30): boolean {
  if (!capturedAt) return true;
  const then = new Date(capturedAt).getTime();
  if (!Number.isFinite(then)) return true;
  return Date.now() - then > days * 86400000;
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: 'חשבון בנק',
  brokerage: 'בית השקעות',
  cash: 'מזומן',
};
