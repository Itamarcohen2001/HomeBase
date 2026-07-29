/** המרות ופורמט תצוגה — כל הסכומים נשמרים כאגורות (מספרים שלמים) */

export function agorotToShekels(agorot: number): number {
  return agorot / 100;
}

export function shekelsToAgorot(value: string | number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

type MoneyOptions = { decimals?: boolean; signed?: boolean };

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(decimals: boolean, signed: boolean): Intl.NumberFormat | null {
  const key = `${decimals}|${signed}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  try {
    const fmt = new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });
    formatterCache.set(key, fmt);
    return fmt;
  } catch {
    // מנוע JS ללא ICU מלא (למשל Hermes בלי intl) — ניפול לפורמט ידני
    return null;
  }
}

/**
 * הפורמט היחיד לסכומים בשקלים באפליקציה.
 * Intl של he-IL מחזיר את הסכום עם סימני כיוון (U+200F) שמקבעים את מיקום ה-₪,
 * כך שהוא לא "קופץ" לצד השני כשהטקסט שסביבו משתנה.
 */
export function formatILS(shekels: number, opts: MoneyOptions = {}): string {
  const { decimals = false, signed = false } = opts;
  const safe = isFinite(shekels) ? shekels : 0;
  const fmt = currencyFormatter(decimals, signed);
  if (fmt) return fmt.format(safe);

  const digits = Math.abs(safe).toLocaleString('he-IL', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  const prefix = safe < 0 ? '-' : signed && safe > 0 ? '+' : '';
  // U+2066 / U+2069 מבודדים את הסכום כרצף LTR כדי שלא יתפרק בתוך משפט בעברית
  return `\u2066${prefix}${digits}\u00A0₪\u2069`;
}

/** סכום באגורות → מחרוזת תצוגה בשקלים */
export function formatMoney(agorot: number, opts: MoneyOptions = {}): string {
  return formatILS((agorot || 0) / 100, opts);
}

const MONTHS_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function monthLabel(month: string | Date): string {
  const d = typeof month === 'string' ? new Date(`${month.slice(0, 10)}T00:00:00`) : month;
  return `${MONTHS_HE[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** היום הראשון בחודש של תאריך נתון, כמחרוזת YYYY-MM-DD */
export function monthStart(d: Date = new Date()): string {
  return toDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function addMonths(monthStr: string, delta: number): string {
  const d = new Date(`${monthStr.slice(0, 10)}T00:00:00`);
  return toDateString(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

export function monthEnd(monthStr: string): string {
  const d = new Date(`${monthStr.slice(0, 10)}T00:00:00`);
  return toDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function daysLeftInMonth(): number {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, last - now.getDate());
}
