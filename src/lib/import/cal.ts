import {
  ImportError,
  type Matrix,
  type ParseResult,
  type ParsedRow,
  findRow,
  headerIndex,
  looksLikeCardCharge,
  norm,
  round2,
  sumRows,
  toDate,
  toNumber,
} from './shared';

/**
 * כ.א.ל / ויזה (יצוא מאתר אוצר החייל — הקובץ נקרא `FibiSave*.xls`).
 *
 * מבנה שנמדד על שני קבצים אמיתיים:
 * - גיליון יחיד בשם `Activities`.
 * - ⚠️ עמודה A ריקה לגמרי, הנתונים ב-B..F. אסור להניח שהטבלה מתחילה ב-A.
 * - שורת כותרות: `תאריך עסקה | שם  העסק | סכום עסקה | סכום חיוב | פירוט`
 *   ⚠️ `שם  העסק` עם שני רווחים — הנרמול ב-`norm` מטפל בזה.
 * - שורת תנועה מזוהה לפי כך ש-`תאריך עסקה` הוא תא Date אמיתי. זה לבדו מסנן
 *   שורות ריקות, שורת הסה"כ ושורות הערה.
 * - שורת `סה"כ` בסוף — משמשת כבדיקת שפיות.
 */
export function parseCal(rows: Matrix): ParseResult {
  const headerRow = findRow(rows, (cells) => cells.includes('תאריך עסקה'));
  if (headerRow < 0) throw new ImportError('לא נמצאה שורת הכותרות של קובץ כ.א.ל');

  const cols = headerIndex(rows[headerRow]);
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = cols.get(n);
      if (i !== undefined) return i;
    }
    return -1;
  };

  const cDate = col('תאריך עסקה');
  const cName = col('שם העסק', 'שם  העסק', 'שם בית עסק');
  const cCharge = col('סכום חיוב');
  const cPurchase = col('סכום עסקה');
  const cDetail = col('פירוט');

  if (cName < 0 || cCharge < 0) throw new ImportError('חסרות עמודות חובה בקובץ כ.א.ל');

  const out: ParsedRow[] = [];
  let statedTotal: number | null = null;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];

    if (row.some((c) => /^סה"כ/.test(norm(c)))) {
      const total = toNumber(row[cCharge]);
      if (Number.isFinite(total)) statedTotal = round2(total);
      continue;
    }

    const date = toDate(row[cDate]);
    const amount = toNumber(row[cCharge]);
    if (!date || !Number.isFinite(amount) || amount === 0) continue;

    const description = norm(row[cName]) || 'ללא שם';
    // סכום שלילי בדוח אשראי = זיכוי (החזר). מוצג, אבל לא מיובא כברירת מחדל.
    out.push({
      date,
      description,
      detail: norm(row[cDetail]) || null,
      amount: Math.abs(amount),
      isRefund: amount < 0,
      isCardCharge: looksLikeCardCharge(description),
    });
  }

  if (!out.length) throw new ImportError('לא נמצאו תנועות בקובץ');

  const notes: string[] = [];
  if (cPurchase >= 0) notes.push('הסכום נלקח מעמודת "סכום חיוב" (ולא "סכום עסקה"), כי הן נבדלות בתשלומים ובמט"ח.');

  return {
    source: 'כ.א.ל / ויזה — אוצר החייל',
    rows: out,
    statedTotal,
    parsedTotal: sumRows(out),
    notes,
  };
}
