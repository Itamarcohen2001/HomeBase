import {
  ImportError,
  type Matrix,
  type ParseResult,
  type ParsedRow,
  headerIndex,
  isBlankRow,
  looksLikeCardCharge,
  norm,
  sumRows,
  toDate,
  toNumber,
} from './shared';

/**
 * פורמט כללי — דוח אשראי מחברה אחרת, או CSV שאינו אחד משני הפורמטים המוכרים.
 *
 * ההיקף הוא דוחות כרטיס אשראי בלבד, ולכן כל שורה היא הוצאה. שורה עם סכום
 * שלילי (או ערך בעמודת זיכוי) היא החזר — היא מוצגת במסך האישור אבל לא
 * מסומנת לייבוא, כי אי אפשר לרשום הוצאה שלילית.
 */
const DATE_HEADERS = ['תאריך עסקה', 'תאריך', 'תאריך חיוב', 'תאריך ערך', 'date'];
const DESC_HEADERS = ['שם בית עסק', 'שם בית העסק', 'שם העסק', 'בית עסק', 'תיאור', 'תאור', 'פרטים', 'פעולה', 'description'];
const AMOUNT_HEADERS = ['סכום חיוב', 'סכום העסקה', 'סכום עסקה', 'סכום', 'חובה', 'חיוב', 'amount', 'debit'];
const REFUND_HEADERS = ['זיכוי', 'זכות', 'credit'];
const DETAIL_HEADERS = ['פירוט', 'הערות', 'סוג עסקה'];

function pick(cols: Map<string, number>, names: string[]): number {
  for (const n of names) {
    const i = cols.get(n);
    if (i !== undefined) return i;
  }
  for (const n of names) {
    for (const [key, i] of cols) {
      if (key.includes(n)) return i;
    }
  }
  return -1;
}

/** מחפש את שורת הכותרות הראשונה שיש בה תאריך + סכום. */
function locateHeader(rows: Matrix): { index: number; cols: Map<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cols = headerIndex(rows[i] ?? []);
    if (!cols.size) continue;
    const hasDate = pick(cols, DATE_HEADERS) >= 0;
    const hasMoney = pick(cols, AMOUNT_HEADERS) >= 0 || pick(cols, REFUND_HEADERS) >= 0;
    if (hasDate && hasMoney) return { index: i, cols };
  }
  return null;
}

export function parseGeneric(rows: Matrix, source = 'דוח אשראי'): ParseResult {
  const header = locateHeader(rows);
  if (!header) {
    throw new ImportError('לא זיהינו את מבנה הקובץ — צריך שורת כותרות עם תאריך וסכום');
  }

  const { cols } = header;
  const cDate = pick(cols, DATE_HEADERS);
  const cDesc = pick(cols, DESC_HEADERS);
  const cAmount = pick(cols, AMOUNT_HEADERS);
  const cRefund = pick(cols, REFUND_HEADERS);
  const cDetail = pick(cols, DETAIL_HEADERS);

  const out: ParsedRow[] = [];
  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) continue;

    const date = toDate(row[cDate]);
    if (!date) continue;

    const charge = cAmount >= 0 ? toNumber(row[cAmount]) : NaN;
    const refund = cRefund >= 0 ? toNumber(row[cRefund]) : NaN;

    let amount = NaN;
    let isRefund = false;
    if (Number.isFinite(charge) && charge !== 0) {
      amount = Math.abs(charge);
      isRefund = charge < 0;
    } else if (Number.isFinite(refund) && refund !== 0) {
      amount = Math.abs(refund);
      isRefund = true;
    }
    if (!Number.isFinite(amount) || amount === 0) continue;

    const description = (cDesc >= 0 ? norm(row[cDesc]) : '') || 'ללא תיאור';
    out.push({
      date,
      description,
      detail: (cDetail >= 0 ? norm(row[cDetail]) : '') || null,
      amount,
      isRefund,
      isCardCharge: !isRefund && looksLikeCardCharge(description),
    });
  }

  if (!out.length) throw new ImportError('לא נמצאו תנועות בקובץ');

  const notes: string[] = [];
  if (out.some((r) => r.isRefund)) {
    notes.push('שורות זיכוי (החזר) מוצגות אבל לא מסומנות לייבוא — אפשר לסמן אותן ידנית.');
  }
  if (out.some((r) => r.isCardCharge)) {
    notes.push('שורות של חיוב כרטיס אשראי הן ריכוז של הוצאות אחרות, ולכן לא מסומנות לייבוא כברירת מחדל.');
  }

  return { source, rows: out, statedTotal: null, parsedTotal: sumRows(out), notes };
}
