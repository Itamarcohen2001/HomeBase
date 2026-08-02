import {
  ImportError,
  type Matrix,
  type ParseResult,
  type ParsedRow,
  extractAccountRef,
  extractHeaderDate,
  findRow,
  headerIndex,
  isBlankRow,
  looksLikeCardCharge,
  norm,
  round2,
  sumRows,
  toDate,
  toNumber,
} from './shared';

/**
 * מסטרקארד דירקט (יצוא מבנק הפועלים).
 *
 * 🔴 המלכודת הקריטית: הגיליון מכיל **שני חתכים של אותו כסף**:
 *   `רכישות בארץ`               — סיכום לפי תאריך חיוב
 *   `פירוט עבור הכרטיסים בארץ`  — התנועות עצמן
 * שניהם מסתכמים בדיוק לאותו סכום. פרסר שסורק "כל שורה עם תאריך + סכום"
 * ייבא פי 2 (נמדד: 1,144.20 במקום 572.10). לכן מייבאים אך ורק מסעיף הפירוט.
 *
 * מבנה סעיף: כותרת → שורת מספר חשבון → שורת כותרות → נתונים → שורה ריקה.
 * ⚠️ סעיפים ריקים (חו"ל) מכילים שורת כותרות בלי נתונים — אסור להניח
 * "יש כותרת ⇒ יש נתונים".
 * ⚠️ המרכאות בקובץ הן `''` ולא `"` — `norm` מנרמל אותן.
 */
const DETAIL_SECTIONS = [
  'פירוט עבור הכרטיסים בארץ',
  'פירוט עבור הכרטיסים בחו"ל',
  'פירוט עבור הכרטיסים בחו"ל בדולר',
  'פירוט עבור הכרטיסים בחו"ל ביורו',
];

function sectionRows(rows: Matrix, titleRow: number): { header: unknown[]; body: unknown[][] } | null {
  const headerRow = titleRow + 2; // כותרת, שורת מספר חשבון, כותרות
  const header = rows[headerRow];
  if (!header || isBlankRow(header)) return null;
  const body: unknown[][] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    if (isBlankRow(rows[i])) break;
    body.push(rows[i] ?? []);
  }
  return { header, body };
}

export function parsePoalim(rows: Matrix): ParseResult {
  const out: ParsedRow[] = [];
  const notes: string[] = [];
  let foundAnySection = false;

  for (const title of DETAIL_SECTIONS) {
    const titleRow = findRow(rows, (cells) => cells[0] === title);
    if (titleRow < 0) continue;
    foundAnySection = true;

    const section = sectionRows(rows, titleRow);
    if (!section || !section.body.length) continue;

    const cols = headerIndex(section.header);
    const col = (...names: string[]): number => {
      for (const n of names) {
        const i = cols.get(n);
        if (i !== undefined) return i;
      }
      return -1;
    };

    const cDate = col('תאריך');
    const cName = col('שם בית עסק');
    const cAmount = col('סכום חיוב בש"ח', 'סכום חיוב בדולר', 'סכום חיוב ביורו', 'סכום קנייה');
    if (cDate < 0 || cName < 0 || cAmount < 0) continue;

    for (const row of section.body) {
      const date = toDate(row[cDate]);
      const amount = toNumber(row[cAmount]);
      if (!date || !Number.isFinite(amount) || amount === 0) continue;
      const description = norm(row[cName]) || 'ללא שם';
      out.push({
        date,
        description,
        detail: null,
        amount: Math.abs(amount),
        isRefund: amount < 0,
        isCardCharge: looksLikeCardCharge(description),
      });
    }
  }

  if (!foundAnySection) throw new ImportError('לא נמצא סעיף "פירוט עבור הכרטיסים" בקובץ');
  if (!out.length) throw new ImportError('לא נמצאו תנועות בקובץ');

  // שורת הסה"כ של הקובץ, לבדיקת שפיות
  let statedTotal: number | null = null;
  const totalRow = findRow(rows, (cells) => cells[0] === 'סה"כ חיובים קודמים בש"ח');
  if (totalRow >= 0) {
    const value = toNumber((rows[totalRow + 1] ?? [])[0]);
    if (Number.isFinite(value)) statedTotal = round2(value);
  }

  if (findRow(rows, (cells) => cells[0] === 'רכישות בארץ') >= 0) {
    notes.push('סעיף "רכישות בארץ" בקובץ הוא סיכום של אותן עסקאות ולכן לא יובא — אחרת כל סכום היה נספר פעמיים.');
  }

  return {
    source: 'מסטרקארד דירקט — בנק הפועלים',
    statementKind: 'credit_report',
    rows: out,
    statedTotal,
    parsedTotal: sumRows(out),
    notes,
    // «מספר חשבון  12-556-568338  תאריך הפקה  24.04.2026»
    // 🪤 זהו חשבון בנק ולא הכרטיס `9041` שבעמודה «שם כרטיס».
    accountRef: extractAccountRef(rows),
    // 🪤 נמדד: הפועלים **אינו** מצהיר «חיוב בתאריך», רק «תאריך הפקה».
    chargeDate: extractHeaderDate(rows, ['חיוב בתאריך']),
    statementDate: extractHeaderDate(rows, ['תאריך הפקה']),
  };
}
