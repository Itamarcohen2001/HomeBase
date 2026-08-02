/**
 * פרסר קובץ אחזקות מבית השקעות.
 *
 * הקובץ הוא **תצלום של התיק ליום ההורדה** — לא רשימת תנועות. לכן הוא לא
 * עובר דרך `src/lib/import` בכלל: אין כאן תאריכים, אין כיוון, ואין כפילויות.
 * מה שכן משותף הוא עזרי הקריאה מהתאים, ואותם משתמשים מחדש כמו שהם.
 *
 * 🔴 אין בקובץ הזה ולו מספר נייר אחד. כל מה שמזוהה — מזוהה אריתמטית.
 */
import { ImportError, headerIndex, norm, round2, toNumber, type Matrix } from '../import/shared';

export type PortfolioPriceFeed = 'yahoo';

export interface PortfolioHolding {
  /** מספר הנייר בבורסה, או צמד מט"ח כשזו שורת מזומן */
  externalId: string;
  name: string;
  symbol: string | null;
  securityType: string | null;
  /** הקוד המספרי שהיה בעמודת המטבע, אם היה */
  currencyCode: string | null;
  /** קוד ISO שנגזר מהקוד המספרי, ואם אין — מהשם */
  currency: string;
  quantity: number;
  /** השער כפי שהופיע בקובץ, בלי נורמליזציה */
  statedRate: number;
  /** «שווי נוכחי» — תמיד בשקלים */
  statedValue: number;
  /** «אחוז אחזקה» מהדוח */
  sharePct: number | null;
  /**
   * שורת מזומן מט"ח: ה«שער» שלה הוא שער החליפין עצמו ולא מחיר נייר.
   * מזוהה אריתמטית — ראו `detectFxCash`.
   */
  isFxCash: boolean;
  /** נקבע רק לשורות מט"ח; לשאר הפיד נגזר מהקטלוג בזמן הפתרון */
  priceFeed: PortfolioPriceFeed | null;
  /** מחיר יחידה בשקלים כפי שהוא משתמע מהקובץ עצמו */
  unitIls: number | null;
  /** האם `כמות × מחיר יחידה` משחזר את «שווי נוכחי» שבקובץ */
  reconciled: boolean;
}

export interface PortfolioParseResult {
  source: string;
  holdings: PortfolioHolding[];
  /** סכום «שווי נוכחי» של כל השורות */
  statedTotal: number;
  /** סכום «אחוז אחזקה». פחות מ-100 מסגיר שהייצוא חלקי. */
  sharePctTotal: number | null;
  /** הפער בשקלים שמשתמע מ-`sharePctTotal` */
  missingValue: number | null;
  notes: string[];
}

/**
 * 🎯 המלכודת שהפילה 11/11: עמודת «מטבע» אינה `"שקל חדש"` אלא
 * `"שקל חדש    000"` — שם המטבע, ריפוד רווחים, וקוד מספרי פנימי.
 * השוואת מחרוזת ישירה נכשלת **בשקט על כל שורה**.
 *
 * הקודים אינם ISO‏ 4217 (שם ILS הוא 376) אלא קודים פנימיים של בית ההשקעות,
 * ולכן ידועים רק אלה שנמדדו. **הקוד המספרי ראשי, השם גיבוי.**
 */
const CURRENCY_BY_CODE: Record<string, string> = {
  '000': 'ILS',
  '001': 'USD',
};

/** גיבוי כשאין קוד מספרי, או כשהקוד אינו מוכר. */
const CURRENCY_BY_NAME: Array<[RegExp, string]> = [
  [/שקל/, 'ILS'],
  [/דולר/, 'USD'],
  [/אירו|יורו/, 'EUR'],
  [/שטרלינג|לירה/, 'GBP'],
  [/פרנק/, 'CHF'],
  [/ין יפני/, 'JPY'],
];

export interface CurrencyCell {
  code: string | null;
  currency: string | null;
  label: string;
}

export function parseCurrencyCell(value: unknown): CurrencyCell {
  const text = norm(value);
  const m = /^(.*?)[\s\u00a0]*(\d{2,4})$/.exec(text);
  const code = m ? m[2] : null;
  const label = m ? m[1].trim() : text;
  if (code && CURRENCY_BY_CODE[code]) return { code, currency: CURRENCY_BY_CODE[code], label };
  for (const [re, iso] of CURRENCY_BY_NAME) {
    if (re.test(label)) return { code, currency: iso, label };
  }
  return { code, currency: null, label };
}

/** «1.5%» ‏/ «1.5» → 1.5 */
function toPercent(value: unknown): number | null {
  const n = toNumber(String(value ?? '').replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * 🪤 תא באחוזים באקסל שומר **שבר** (`0.9953`) ומציג `99.53%`. עם `raw: true`
 * מקבלים את השבר. אם נניח שהמספר כבר באחוזים, «חסרות אחזקות» יציג סכום
 * מופרך פי 100 — בדיוק המספר היפה-והשקרי שהמשתמש שלל.
 *
 * הדיסקרימינטור הוא הסכום: תיק שלם מסתכם ב-100 או ב-1, ולא בשום דבר באמצע.
 */
export function sharePctScale(values: number[]): number {
  if (!values.length) return 1;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum > 0 && sum <= 1.5 ? 100 : 1;
}

const AGOROT_DIVISOR = 100;
/** סטייה יחסית שמעבר לה כבר לא מדובר באותו מספר */
const MATCH_TOLERANCE = 0.005;

function closeEnough(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= MATCH_TOLERANCE;
}

/**
 * 🎯 זיהוי שורת מזומן מט"ח.
 *
 * שורת מט"ח נראית כמו נייר: יש לה מספר, כמות ו«שער». אבל ה«שער» שלה הוא
 * שער החליפין עצמו, ושליחתה למנוע התמחור מחזירה זבל.
 *
 * 🔴 **הסימן הראשי הוא עמודת «סוג נייר», לא האריתמטיקה.** נמדד על שני
 *    קבצים אמיתיים: הזהות `כמות × שער ÷ 100 = שווי` מתקיימת ב-**9 מתוך 11**
 *    השורות, כולל חמש מניות שקליות רגילות לגמרי — מפני שנייר שקלי מצוטט
 *    גם הוא באגורות. אריתמטיקה לבדה הייתה מסמנת חמש מניות כמזומן.
 *
 * 🔴 **וגם התנאי «שורה שאינה שקלית» שגוי.** בית ההשקעות מדווח את *השווי*
 *    בשקלים, ולכן תא «מטבע» של שורת המט"ח אומר «שקל חדש···000». הסינון
 *    לפי מטבע חסם את השורה היחידה שאותה נועד לתפוס, בשקט.
 *
 * ⚠️ «סוג נייר» הוא שדה סוג **מובנה שהקובץ מצהיר** — לא היוריסטיקה על שם
 *    חופשי ולא מזהה קשיח, ולכן אינו סותר את דרישת הגנריות.
 *
 * 🔬 המטבע נגזר מ**שם** השורה («דולר ארה"ב») ולא מתא המטבע, שכאמור מדווח
 *    את מטבע השווי. כשאי אפשר לקבוע אותו — מצהירים ולא מנחשים.
 */
const CASH_TYPE = /מזומן/;

export interface FxCashDetection {
  isFxCash: boolean;
  /** מטבע המזומן עצמו, לא מטבע השווי */
  currency: string | null;
  /** «סוג נייר» הכריז מזומן אבל האריתמטיקה אינה תומכת */
  conflict: boolean;
}

export function detectFxCash(row: {
  securityType: string | null;
  name: string;
  currency: string | null;
  quantity: number;
  statedRate: number;
  statedValue: number;
}): FxCashDetection {
  const none: FxCashDetection = { isFxCash: false, currency: null, conflict: false };
  if (!row.securityType || !CASH_TYPE.test(row.securityType)) return none;

  // המטבע מגיע מהשם. תא המטבע מדווח את מטבע השווי (שקלים) ולכן חסר ערך כאן.
  let iso: string | null = null;
  for (const [re, code] of CURRENCY_BY_NAME) {
    if (re.test(row.name)) {
      iso = code;
      break;
    }
  }
  // מזומן שקלי אינו צמד מט"ח; ומטבע שלא זוהה — מצהירים במקום להמציא צמד.
  if (!iso || iso === 'ILS') return { isFxCash: false, currency: iso, conflict: true };

  if (!(row.quantity > 0) || !Number.isFinite(row.statedRate) || !Number.isFinite(row.statedValue)) {
    return { isFxCash: false, currency: iso, conflict: true };
  }

  // אישוש: השער באגורות שקל, ולכן `כמות × שער ÷ 100` חייב לשחזר את השווי.
  const supported = closeEnough((row.quantity * row.statedRate) / AGOROT_DIVISOR, row.statedValue);
  return { isFxCash: supported, currency: iso, conflict: !supported };
}

const HEADER_NAME = 'שם נייר';
const HEADER_ID = 'מספר נייר';
const HEADER_SYMBOL = 'סימבול';
const HEADER_TYPE = 'סוג נייר';
const HEADER_CURRENCY = 'מטבע';
const HEADER_QTY = 'כמות נוכחית';
const HEADER_RATE = 'שער';
const HEADER_VALUE = 'שווי נוכחי';
const HEADER_SHARE = 'אחוז אחזקה';

const REQUIRED = [HEADER_NAME, HEADER_ID, HEADER_QTY, HEADER_RATE, HEADER_VALUE];

/**
 * שורת הכותרות היא הראשונה בקובץ שנמדד, אבל מחפשים אותה במקום להניח:
 * ייצוא עם שורת כותרת עליונה מזיז הכול, וכשל שקט כאן שווה תיק ריק.
 */
function findHeaderRow(rows: Matrix): number {
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] ?? []).map(norm);
    if (REQUIRED.every((h) => cells.includes(h))) return i;
  }
  return -1;
}

const NO_HEADER_MESSAGE =
  'לא זיהינו את שורת הכותרות בקובץ. צריך ייצוא אחזקות שכולל את העמודות «שם נייר», «מספר נייר», «כמות נוכחית», «שער» ו«שווי נוכחי».';

export function parsePortfolioRows(rows: Matrix, source = 'קובץ אחזקות'): PortfolioParseResult {
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) throw new ImportError(NO_HEADER_MESSAGE);

  const col = headerIndex(rows[headerRow] ?? []);
  const at = (row: unknown[], header: string): unknown => {
    const i = col.get(header);
    return i === undefined ? null : row[i];
  };

  const holdings: PortfolioHolding[] = [];
  const notes: string[] = [];
  let skippedNoId = 0;
  let skippedNoQty = 0;
  let unknownCurrency = 0;
  let unreconciled = 0;
  const cashConflicts: string[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = norm(at(row, HEADER_NAME));
    const externalId = norm(at(row, HEADER_ID));
    const quantity = toNumber(at(row, HEADER_QTY));
    const statedRate = toNumber(at(row, HEADER_RATE));
    const statedValue = toNumber(at(row, HEADER_VALUE));

    if (!externalId && !name) continue;
    // שורת סיכום בתחתית הקובץ: שווי בלי מספר נייר
    if (!externalId) {
      skippedNoId++;
      continue;
    }
    if (!Number.isFinite(quantity) || quantity === 0) {
      skippedNoQty++;
      continue;
    }

    const cur = parseCurrencyCell(at(row, HEADER_CURRENCY));
    if (!cur.currency) unknownCurrency++;

    const securityType = norm(at(row, HEADER_TYPE)) || null;
    const fx = detectFxCash({
      securityType,
      name,
      currency: cur.currency,
      quantity,
      statedRate,
      statedValue,
    });
    const isFxCash = fx.isFxCash;
    if (fx.conflict) cashConflicts.push(name || externalId);

    // מחיר היחידה בשקלים כפי שהוא משתמע מהקובץ. לשורה שקלית ולמזומן מט"ח
    // ה«שער» באגורות; לנייר זר הוא ביחידות מלאות ודורש שער חליפין שאינו
    // בקובץ — ולכן נגזר מהשווי המוצהר עצמו.
    const quotedInAgorot = cur.currency === 'ILS' || isFxCash;
    const unitIls = quotedInAgorot
      ? Number.isFinite(statedRate)
        ? statedRate / AGOROT_DIVISOR
        : null
      : Number.isFinite(statedValue) && quantity !== 0
        ? statedValue / quantity
        : null;

    const reconciled = unitIls !== null && closeEnough(quantity * unitIls, statedValue);
    if (!reconciled) unreconciled++;

    holdings.push({
      externalId: isFxCash ? `${fx.currency}ILS=X` : externalId,
      name: name || externalId,
      symbol: norm(at(row, HEADER_SYMBOL)) || null,
      securityType,
      currencyCode: cur.code,
      // שורת מזומן מט"ח מחזיקה את מטבע המזומן, לא את מטבע השווי
      currency: (isFxCash ? fx.currency : cur.currency) ?? 'ILS',
      quantity,
      statedRate,
      statedValue: Number.isFinite(statedValue) ? statedValue : 0,
      sharePct: toPercent(at(row, HEADER_SHARE)),
      isFxCash,
      // צמד מט"ח נשלף מ-Yahoo; נייר בבורסה נפתר מול הקטלוג ולכן נשאר פתוח
      priceFeed: isFxCash ? 'yahoo' : null,
      unitIls,
      reconciled,
    });
  }

  if (!holdings.length) throw new ImportError('לא נמצאו אחזקות בקובץ.');

  const scale = sharePctScale(holdings.map((h) => h.sharePct).filter((p): p is number => p !== null));
  if (scale !== 1) {
    for (const h of holdings) if (h.sharePct !== null) h.sharePct = round2(h.sharePct * scale);
  }

  const statedTotal = round2(holdings.reduce((s, h) => s + h.statedValue, 0));
  const withShare = holdings.filter((h) => h.sharePct !== null);
  const sharePctTotal = withShare.length
    ? round2(withShare.reduce((s, h) => s + (h.sharePct ?? 0), 0))
    : null;

  // 🎯 «אחוז אחזקה» הוא בדיקת שלמות חינם: אם הוא מסתכם בפחות מ-100%,
  //    הייצוא אינו כולל את כל התיק. המשתמש ביקש במפורש לראות פערים.
  const missingValue =
    sharePctTotal !== null && sharePctTotal > 0 && sharePctTotal < 99.9 && statedTotal > 0
      ? round2(statedTotal / (sharePctTotal / 100) - statedTotal)
      : null;

  const fxCash = holdings.filter((h) => h.isFxCash);
  if (fxCash.length) {
    notes.push(
      `${fxCash.length} שורות הן יתרת מזומן במטבע חוץ ולא ניירות ערך. הן יתומחרו לפי שער החליפין.`,
    );
  }
  if (missingValue !== null) {
    notes.push(
      `«אחוז אחזקה» בקובץ מסתכם ב-${sharePctTotal}% ולא ב-100%. חסרות אחזקות בשווי של כ-${missingValue} ₪ שהייצוא אינו כולל.`,
    );
  }
  if (cashConflicts.length) {
    // 🔴 «סוג נייר» הצהיר מזומן אבל המטבע או האריתמטיקה לא תמכו.
    //    מצהירים ולא מנחשים — שורה כזו תישאר בשווי שבדוח ולא תתומחר כצמד מט"ח.
    notes.push(
      `${cashConflicts.length} שורות מסומנות בקובץ כמזומן אך לא הצלחנו לקבוע את המטבע שלהן (${cashConflicts.join(', ')}). הן יישמרו בשווי שבדוח בלי מחיר חי.`,
    );
  }
  if (unknownCurrency) {
    notes.push(`ב-${unknownCurrency} שורות לא זיהינו את המטבע, והן יטופלו כשקליות.`);
  }
  if (unreconciled) {
    notes.push(
      `ב-${unreconciled} שורות «כמות × שער» אינו מסתדר עם «שווי נוכחי» שבקובץ. השווי שיוצג להן יילקח מהמחיר החי.`,
    );
  }
  if (skippedNoId) notes.push(`${skippedNoId} שורות בלי מספר נייר לא יובאו (בדרך כלל שורת סיכום).`);
  if (skippedNoQty) notes.push(`${skippedNoQty} שורות בלי כמות לא יובאו.`);

  return { source, holdings, statedTotal, sharePctTotal, missingValue, notes };
}

export interface PortfolioFile {
  name: string;
  data: ArrayBuffer | Uint8Array;
}

export async function parsePortfolioFile(file: PortfolioFile): Promise<PortfolioParseResult> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!['xls', 'xlsx', 'csv'].includes(ext)) {
    throw new ImportError('פורמט לא נתמך. אפשר להעלות קבצי Excel‏ (xlsx / xls) או CSV.');
  }
  if (!file.data.byteLength) throw new ImportError('הקובץ ריק');

  // SheetJS נטען דינמית כדי שלא ייכנס ל-bundle הראשי.
  const XLSX = await import('xlsx');
  const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
  const wb = XLSX.read(bytes, { type: 'array' });

  let best: Matrix | null = null;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    }) as Matrix;
    if (findHeaderRow(rows) >= 0 && (!best || rows.length > best.length)) best = rows;
  }

  if (!best) throw new ImportError(NO_HEADER_MESSAGE);
  return parsePortfolioRows(best, 'קובץ אחזקות מבית השקעות');
}
