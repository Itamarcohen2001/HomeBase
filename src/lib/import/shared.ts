import type { Kind } from '../types';

/** שורה אחת שנקראה מקובץ, לפני קטלוג ולפני זיהוי כפילויות. */
export type ParsedRow = {
  /** ISO yyyy-mm-dd — תאריך העסקה (לא תאריך החיוב) */
  date: string;
  /** שם בית העסק כפי שהופיע בקובץ */
  description: string;
  /** טקסט עזר מהקובץ (פירוט / שם מקבל בהעברה) */
  detail?: string | null;
  /** תמיד חיובי */
  amount: number;
  /** שורת סיכום של חיוב כרטיס אשראי — לא מיובאת כברירת מחדל */
  isCardCharge?: boolean;
  /** זיכוי / החזר (סכום שלילי בדוח) — מוצג אבל לא מסומן לייבוא כברירת מחדל */
  isRefund?: boolean;
};

/** כל התנועות המיובאות הן הוצאות — ההיקף הוא דוחות אשראי בלבד. */
export const IMPORT_KIND: Kind = 'expense';

export type ParseResult = {
  /** שם הפורמט להצגה למשתמש */
  source: string;
  rows: ParsedRow[];
  /** הסכום שכתוב בקובץ עצמו, לבדיקת שפיות. null כשאין שורת סה"כ */
  statedTotal: number | null;
  /** סכום השורות שפורסרו בפועל */
  parsedTotal: number;
  /** הערות בעברית להצגה במסך האישור */
  notes: string[];
};

export class ImportError extends Error {}

/**
 * ⚠️ המרכאות בקבצי בנק הפועלים הן שני גרשים (`''`) ולא גרשיים (`"`),
 * ובקבצי כ.א.ל יש כותרות עם רווח כפול (`שם  העסק`).
 * כל השוואת מחרוזת חייבת לעבור דרך הנרמול הזה.
 */
export function norm(value: unknown): string {
  return String(value ?? '')
    .replace(/''/g, '"')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** מפתח להשוואת תיאורים: ללא סימני פיסוק, אותיות קטנות, רווחים מכווצים. */
export function normKey(value: unknown): string {
  return norm(value)
    .toLowerCase()
    .replace(/["'`,.()\[\]{}]/g, '')
    .replace(/[-–—_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDateCell(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** תאריך מקומי — לא toISOString, שמזיז יום אחורה באזורי זמן חיוביים. */
export function toISODate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** מקבל תא של תאריך, מספר סריאלי של אקסל או טקסט בפורמט ישראלי. */
export function toDate(value: unknown): string | null {
  if (isDateCell(value)) return toISODate(value);
  if (typeof value === 'number' && value > 20000 && value < 90000) {
    // סריאל של אקסל: יום 25569 = 1970-01-01
    const utc = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (Number.isNaN(utc.getTime())) return null;
    return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
  }
  const text = norm(value);
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return `${year}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** מספר מתא. מטפל גם ב-"1,234.56" ו-"12.30 ₪". */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = norm(value).replace(/[₪\s]/g, '').replace(/,/g, '');
  if (!text) return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** סכום החיובים פחות הזיכויים — מה שמשווים לשורת הסה"כ שבקובץ. */
export function sumRows(rows: ParsedRow[]): number {
  return round2(rows.reduce((acc, r) => acc + (r.isRefund ? -r.amount : r.amount), 0));
}

/** שורות שהן חיוב מרוכז של כרטיס אשראי — סיכום של הוצאות אחרות. */
const CARD_CHARGE =
  /(כרטיס(?:י)? אשראי|חיוב כרטיס|לאומי קארד|ישראכרט|מקס איט|כ\.?א\.?ל|מסטרקארד|אמריקן אקספרס|ויזה)/;

export function looksLikeCardCharge(description: string): boolean {
  return CARD_CHARGE.test(norm(description));
}

export type Matrix = unknown[][];

/** האם השורה ריקה לגמרי (מסמנת סוף סעיף בקבצי הפועלים). */
export function isBlankRow(row: unknown[] | undefined): boolean {
  if (!row) return true;
  return row.every((c) => c === null || c === undefined || norm(c) === '');
}

/** אינדקס השורה הראשונה שבה מופיע הטקסט (אחרי נרמול) באחד התאים. */
export function findRow(rows: Matrix, predicate: (cells: string[], row: unknown[]) => boolean): number {
  for (let i = 0; i < rows.length; i++) {
    if (predicate((rows[i] ?? []).map(norm), rows[i] ?? [])) return i;
  }
  return -1;
}

/** ממפה שורת כותרות לאינדקסי עמודות, אחרי נרמול רווחים ומרכאות. */
export function headerIndex(row: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  row.forEach((cell, i) => {
    const key = norm(cell);
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}
