/** המרות ופורמט תצוגה — כל הסכומים נשמרים כאגורות (מספרים שלמים) */

export function agorotToShekels(agorot: number): number {
  return agorot / 100;
}

export function shekelsToAgorot(value: string | number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatMoney(agorot: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const { decimals = false, sign = false } = opts;
  const value = Math.abs(agorot) / 100;
  const str = value.toLocaleString('he-IL', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  const prefix = sign ? (agorot < 0 ? '-' : '+') : agorot < 0 ? '-' : '';
  return `${prefix}₪${str}`;
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
