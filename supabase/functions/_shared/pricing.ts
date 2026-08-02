// מנוע תמחור — לוגיקה טהורה, בלי Deno ובלי גישה לרשת מלבד `fetch` שמוזרק.
// יושב ב-_shared כדי שגם ה-Edge Function וגם ההארנס יריצו בדיוק את אותו קוד.
//
// 🔴 אין כאן ולו מספר נייר אחד. הכול נגזר מהקטלוג בזמן ריצה — זו דרישת-על
//    מהמשתמש, וההארנס מתמחר ניירות שנדגמו אקראית כדי לקבע אותה.

export type PriceFeed = 'tase_security' | 'tase_fund' | 'yahoo';

/** מחלקת נכס לגרף ההתפלגות. `checking` ו-`pending` אינם ניירות ולכן אינם כאן. */
export type AssetClass = 'equity' | 'money_market' | 'bond' | 'cash' | 'other';

export interface SecurityRef {
  external_id: string;
  price_feed: PriceFeed;
  quote_currency?: string | null;
  /** שם הנייר — ממנו נחלץ סימול זר כשפיד ת"א לא מחזיר מחיר */
  name?: string | null;
}

export interface Quote {
  /** השער כפי שהפיד מסר אותו, בלי נורמליזציה */
  rate: number;
  /** המטבע שבו הפיד מצטט (ILA לאגורות, USD, GBp, …) */
  currency: string;
  /** תאריך המסחר, yyyy-mm-dd */
  date: string;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

// ── מקורות ─────────────────────────────────────────────────────────────────
// 🔴 בלי חמש הכותרות האלה ה-API מחזיר 403. אומת ישירות: בלי → 403, עם → 200.
export const TASE_HEADERS: Record<string, string> = {
  'X-Maya-With': 'allow',
  'Accept-Language': 'en-US',
  referer: 'https://www.tase.co.il/',
  'Cache-Control': 'no-cache',
  'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; FSL 7.0.6.01001)',
};

export const CATALOG_URL = 'https://api.tase.co.il/api/content/searchentities?lang=2';
const SECURITY_URL = (id: string) =>
  `https://api.tase.co.il/api/company/securitydata?securityId=${encodeURIComponent(id)}&lang=2`;
const FUND_URL = (id: string) =>
  `https://mayaapi.tase.co.il/api/fund/details?fundId=${encodeURIComponent(id)}&lang=2`;
const YAHOO_URL = (sym: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`;

// ── נורמליזציה למטבע ──────────────────────────────────────────────────────
// 🪤 הבורסה בת"א מצטטת באגורות: 7239 = ‏72.39 ₪. אותה מלכודת קיימת ב-GBp
//    בלונדון וב-ZAc ביוהנסבורג. הנורמליזציה מתבצעת **כאן בלבד** —
//    ה-DB מקבל `ils_price_agorot` מוכן, ואף שכבה אחרת לא ממירה שוב.
export const UNIT_DIVISOR: Record<string, number> = { ILA: 100, GBp: 100, GBX: 100, ZAc: 100 };

/** מטבע-האם של יחידת המשנה. ILA→ILS, GBp→GBP, ZAc→ZAR. */
export const MAJOR_CURRENCY: Record<string, string> = {
  ILA: 'ILS',
  GBp: 'GBP',
  GBX: 'GBP',
  ZAc: 'ZAR',
};

export function majorCurrency(code: string): string {
  return MAJOR_CURRENCY[code] ?? code;
}

/**
 * ממיר שער מצוטט לאגורות שקל.
 * `fxToIls` הוא שער החליפין ממטבע-האם לשקל (1 עבור שקל).
 * מחזיר null כשחסר שער חליפין — עדיף להצהיר על פער מאשר להציג מספר שקרי.
 */
export function toIlsAgorot(rate: number, currency: string, fxToIls: number | null): number | null {
  if (!Number.isFinite(rate)) return null;
  const divisor = UNIT_DIVISOR[currency] ?? 1;
  const major = majorCurrency(currency);
  const inMajorUnits = rate / divisor;
  if (major === 'ILS') return Math.round(inMajorUnits * 100);
  if (fxToIls === null || !Number.isFinite(fxToIls) || fxToIls <= 0) return null;
  return Math.round(inMajorUnits * fxToIls * 100);
}

// ── עזרי פענוח ────────────────────────────────────────────────────────────
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** dd/MM/yyyy → yyyy-mm-dd. פורמט התאריך של הבורסה. */
function fromTaseDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** ISO מלא → yyyy-mm-dd, בלי מעבר דרך Date (אזור זמן מזיז יום אחורה). */
function fromIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** unix seconds → yyyy-mm-dd. Yahoo מוסר חותמת זמן של רגע המסחר. */
function fromUnix(v: unknown): string | null {
  const n = num(v);
  if (n === null) return null;
  const d = new Date(n * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function todayIso(): string {
  const d = new Date();
  // מקומי בכוונה — toISOString ב-UTC מזיז יום אחורה בערב
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * חילוץ סימול זר משם הנייר — סוגריים **בסוף** השם בלבד.
 * `ISHARES M(URTH)` → URTH · `INVESCO  (QQQ)` → QQQ
 *
 * 🔴 נקרא אך ורק כנפילה-אחורה אחרי שהפיד של ת"א לא החזיר מחיר.
 *    הסדר הזה הוא מה שמנטרל את התאמות השווא.
 */
export function extractForeignSymbol(name: string): string | null {
  const m = /\(([A-Z]{1,5}(?:\.[A-Z]{1,3})?)\)\s*$/.exec(String(name ?? '').trim());
  return m ? m[1] : null;
}

// ── שליפת ציטוט ───────────────────────────────────────────────────────────
async function getJson(
  fetchImpl: FetchLike,
  url: string,
  headers?: Record<string, string>,
): Promise<Record<string, unknown> | unknown[] | null> {
  try {
    const res = await fetchImpl(url, headers ? { headers } : undefined);
    if (res.status !== 200) return null;
    return (await res.json()) as Record<string, unknown> | unknown[] | null;
  } catch {
    return null;
  }
}

type MetaShape = { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };

/**
 * 🔴 המלכודת המרכזית של הפיד הזה:
 * `securitydata` **אינו מחזיר 404** על קרן נאמנות, וגם לא על מספר נייר מומצא —
 * הוא מחזיר **200 עם גוף ריק**. נמדד על 10/10 קרנות אקראיות ועל `9999999`,
 * `1` ו-`0`. לכן «נסה סחיר, ואם 404 נפול לקרן» לא ייפול לעולם וכל הקרנות
 * היו נשארות בלי מחיר בשקט.
 *
 * ⇒ הניתוב נקבע מסוג הנייר בקטלוג (`price_feed`), והתיקוף הוא
 *   `Number.isFinite(שער)` — לא קוד הסטטוס.
 */
export async function fetchQuote(sec: SecurityRef, fetchImpl: FetchLike): Promise<Quote | null> {
  if (sec.price_feed === 'tase_security') {
    const j = (await getJson(fetchImpl, SECURITY_URL(sec.external_id), TASE_HEADERS)) as
      | Record<string, unknown>
      | null;
    if (!j) return null;
    // LastRate הוא השער האחרון שנסחר; BaseRate הוא שער הבסיס, לימים בלי מסחר.
    const rate = num(j.LastRate) ?? num(j.BaseRate);
    if (rate === null || rate <= 0) return null;
    return {
      rate,
      currency: sec.quote_currency || 'ILA',
      date: fromTaseDate(j.TradeDate) ?? fromTaseDate(j.EODTradeDate) ?? todayIso(),
    };
  }

  if (sec.price_feed === 'tase_fund') {
    const j = (await getJson(fetchImpl, FUND_URL(sec.external_id), TASE_HEADERS)) as
      | Record<string, unknown>
      | null;
    if (!j) return null;
    // 🪤 SellPrice הוא מחיר הפדיון (NAV). UnitValuePrice כולל שיעור הוספה
    //    ולכן גבוה ממנו — שווי אחזקה נמדד לפי מה שמקבלים בפדיון, לא בקנייה.
    const rate = num(j.SellPrice) ?? num(j.CreationPrice) ?? num(j.UnitValuePrice);
    if (rate === null || rate <= 0) return null;
    return {
      rate,
      currency: sec.quote_currency || 'ILA',
      date: fromIsoDate(j.UnitValueValidDate) ?? fromIsoDate(j.AssetAsOfDate) ?? todayIso(),
    };
  }

  const j = (await getJson(fetchImpl, YAHOO_URL(sec.external_id))) as MetaShape | null;
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const rate = num(meta.regularMarketPrice) ?? num(meta.previousClose);
  if (rate === null || rate <= 0) return null;
  return {
    rate,
    // Yahoo מוסר את המטבע בעצמו, כולל GBp למניות בלונדון.
    currency: (typeof meta.currency === 'string' && meta.currency) || sec.quote_currency || 'USD',
    date: fromUnix(meta.regularMarketTime) ?? todayIso(),
  };
}

/** שער חליפין למטבע כלשהו מול השקל. גנרי — `USDILS=X`, `EURILS=X`, … */
export async function fetchFxToIls(base: string, fetchImpl: FetchLike): Promise<number | null> {
  if (base === 'ILS') return 1;
  const j = (await getJson(fetchImpl, YAHOO_URL(`${base}ILS=X`))) as MetaShape | null;
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const rate = num(meta.regularMarketPrice) ?? num(meta.previousClose);
  return rate !== null && rate > 0 ? rate : null;
}

// ── קטלוג ─────────────────────────────────────────────────────────────────
export interface CatalogItem {
  Id: string;
  Name: string;
  Smb: string | null;
  ISIN: string | null;
  Type: number;
  SubTypeDesc: string | null;
}

export interface CatalogEntry {
  external_id: string;
  price_feed: PriceFeed;
  name: string;
  symbol: string | null;
  isin: string | null;
  category: string | null;
  asset_class: AssetClass;
}

/**
 * סיווג לגרף ההתפלגות — **ברירת מחדל בלבד**, ניתן לעריכה ידנית.
 *
 * המשתמש ביקש ארבע פרוסות: שוק ההון · קרן כספית/פק"מ · מזומן · עו"ש.
 * שתי האחרונות נגזרות מ-`accounts.kind` ולא מכאן. לכן הסיווג האוטומטי
 * מכריע בין `money_market` ל-`equity` בלבד.
 *
 * 🔴 `bond` הוא ערך חוקי בסכימה לעריכה ידנית, אך **לא מוקצה אוטומטית**.
 *    מדדתי היוריסטיקת-שם על הקטלוג המלא: היא סיווגה 1,259 ניירות, ומדגם
 *    בן 49 חשף 9 קרנות אג"ח מובהקות שהיא מפספסת (`מדינה`, `מדורג`,
 *    `חברות` בלי המילה אג"ח). פרוסה חמישית שגויה חלקית גרועה מהיעדרה.
 *
 * 🔴 `פקדון` הוא טוקן אסור. הוא שם של אג"ח קונצרנית (`אביעד פקדון אגח א`)
 *    ולא קרן כספית; הכללתו הוסיפה 41 חיובי-שגוי במדידת הרכז.
 *
 * 🔴 **אין שער לפי `price_feed`.** הגרסה הקודמת הגבילה ל-`tase_fund`
 *    (קרן נאמנות), והשער הפיל שתי **קרנות סל על מק"מ** שנסחרות ולכן
 *    ‏`Type=1`: הן כספיות תפקודית לחלוטין, והמשתמש ביקש במפורש
 *    «קרן כספית/**פק"מ**». נמדד על כל 4,208 הניירות הניתנים להחזקה:
 *    ‏76 → 78, **אפס זיהום** — ואף אחד מ-34 השמות שמכילים את הטוקן
 *    האסור אינו דולף, מפני שהביטוי עצמו כבר מבחין. בקרה חיובית:
 *    ‏125 ניירות `Type=1` מנייתיים מובהקים, אף אחד מהם אינו נתפס.
 *
 * 🪤 צמד מט"ח (`USDILS=X`) הוא **מזומן**, לא נייר — הפרסר מייצר אותו
 *    לשורות יתרת מזומן במטבע חוץ.
 */
const MONEY_MARKET = /כספית|מק["׳']?מ(\s|$)/;

export function classifyAsset(entry: {
  price_feed: PriceFeed;
  name: string;
  external_id: string;
  category?: string | null;
}): AssetClass {
  if (/^[A-Z]{3}[A-Z]{3}=X$/.test(entry.external_id)) return 'cash';
  if (MONEY_MARKET.test(entry.name)) return 'money_market';
  return 'equity';
}

/**
 * 🪤 `Id` ולא `SubId` — ‏`SubId` הוא מזהה המנפיק ומחזיר נייר אחר.
 * 🪤 רק Type=1 (סחיר) ו-Type=4 (קרן נאמנות) ניתנים להחזקה; שאר הסוגים
 *    בקטלוג הם מדדים, מנפיקים וכיוצא באלה.
 */
export function catalogToEntry(item: CatalogItem): CatalogEntry | null {
  if (item.Type !== 1 && item.Type !== 4) return null;
  const id = String(item.Id ?? '').trim();
  if (!id) return null;
  const price_feed: PriceFeed = item.Type === 1 ? 'tase_security' : 'tase_fund';
  const name = String(item.Name ?? '').trim();
  return {
    external_id: id,
    price_feed,
    name,
    symbol: item.Smb ? String(item.Smb).trim() : null,
    isin: item.ISIN ? String(item.ISIN).trim() : null,
    category: item.SubTypeDesc
      ? String(item.SubTypeDesc).trim()
      : item.Type === 4
        ? 'קרן נאמנות'
        : null,
    asset_class: classifyAsset({ price_feed, name, external_id: id }),
  };
}

/** נירמול לחיפוש מקומי: אותיות קטנות, גרשיים מנוקים, רווחים מכווצים. */
export function searchKey(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/["'`׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 🪤 הפרמטר `q` בנקודת הקצה של הקטלוג **מתעלם** — היא מחזירה תמיד את כל
 *    הקטלוג. לכן מושכים אותו פעם אחת ומחפשים מקומית.
 */
export function searchCatalog(entries: CatalogEntry[], query: string, limit = 25): CatalogEntry[] {
  const q = searchKey(query);
  if (q.length < 2) return [];
  const out: CatalogEntry[] = [];
  for (const e of entries) {
    if (out.length >= limit) break;
    if (
      searchKey(e.name).includes(q) ||
      (e.symbol ? searchKey(e.symbol).includes(q) : false) ||
      e.external_id.startsWith(q) ||
      (e.isin ? e.isin.toLowerCase() === q : false)
    ) {
      out.push(e);
    }
  }
  return out;
}

export async function fetchCatalog(fetchImpl: FetchLike): Promise<CatalogEntry[]> {
  const raw = await getJson(fetchImpl, CATALOG_URL, TASE_HEADERS);
  if (!Array.isArray(raw)) return [];
  const out: CatalogEntry[] = [];
  for (const item of raw as CatalogItem[]) {
    const e = catalogToEntry(item);
    if (e) out.push(e);
  }
  return out;
}

// ── תמחור חבילה ───────────────────────────────────────────────────────────
export interface PricedRow {
  external_id: string;
  price_feed: PriceFeed;
  stated_rate: number;
  stated_currency: string;
  ils_price_agorot: number;
  price_date: string;
}

export interface PriceRunResult {
  priced: PricedRow[];
  /** ניירות שהפיד לא החזיר להם מחיר — מוצהרים, לא נבלעים */
  failed: string[];
  fx: Record<string, number>;
  /** ניירות שנפדו מ-Yahoo אחרי שפיד ת"א לא החזיר מחיר */
  fallbacks: Array<{ external_id: string; symbol: string }>;
}

/**
 * ציטוט עם נפילה-אחורה: אם פיד ת"א לא החזיר מחיר ושם הנייר נגמר בסימול
 * זר בסוגריים, מנסים את Yahoo.
 *
 * 🔴 **הסדר קריטי.** החילוץ נמדד על כל 4,208 הניירות הסחירים והתאים בטעות
 *    לאחד (0.024%). הוא בלתי מזיק **רק** משום שהוא נקרא אחרי שת"א נכשלה:
 *    לנייר שת"א מתמחרת הוא לא ייקרא לעולם. אין להקדים אותו.
 *
 * 🪤 הזהות נשמרת: השורה שחוזרת נושאת את ה-`external_id` וה-`price_feed`
 *    **המקוריים**, כי ה-Edge Function ממפה בחזרה לפי הצמד הזה.
 */
async function quoteWithFallback(
  sec: SecurityRef,
  fetchImpl: FetchLike,
): Promise<{ quote: Quote; symbol: string | null } | null> {
  const direct = await fetchQuote(sec, fetchImpl);
  if (direct) return { quote: direct, symbol: null };
  if (sec.price_feed === 'yahoo') return null;

  const symbol = extractForeignSymbol(sec.name ?? '');
  if (!symbol) return null;
  const viaYahoo = await fetchQuote(
    { external_id: symbol, price_feed: 'yahoo', quote_currency: null },
    fetchImpl,
  );
  return viaYahoo ? { quote: viaYahoo, symbol } : null;
}

/**
 * מתמחר רשימת ניירות ומחזיר שורות מוכנות לכתיבה.
 * שערי החליפין נשלפים פעם אחת לכל מטבע ונשמרים לאורך הריצה.
 */
export async function priceSecurities(
  securities: SecurityRef[],
  fetchImpl: FetchLike,
): Promise<PriceRunResult> {
  const priced: PricedRow[] = [];
  const failed: string[] = [];
  const fallbacks: Array<{ external_id: string; symbol: string }> = [];
  const fx: Record<string, number> = { ILS: 1 };

  for (const sec of securities) {
    const got = await quoteWithFallback(sec, fetchImpl);
    if (!got) {
      failed.push(sec.external_id);
      continue;
    }
    const { quote, symbol } = got;
    const major = majorCurrency(quote.currency);
    if (!(major in fx)) {
      const rate = await fetchFxToIls(major, fetchImpl);
      if (rate !== null) fx[major] = rate;
    }
    const agorot = toIlsAgorot(quote.rate, quote.currency, fx[major] ?? null);
    if (agorot === null) {
      failed.push(sec.external_id);
      continue;
    }
    if (symbol) fallbacks.push({ external_id: sec.external_id, symbol });
    priced.push({
      external_id: sec.external_id,
      price_feed: sec.price_feed,
      stated_rate: quote.rate,
      stated_currency: quote.currency,
      ils_price_agorot: agorot,
      price_date: quote.date,
    });
  }

  return { priced, failed, fx, fallbacks };
}
