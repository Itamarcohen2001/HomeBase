import {
  ImportError,
  type Matrix,
  type ParseResult,
  type ParsedRow,
  extractAccountRef,
  extractHeaderDate,
  findRow,
  headerIndex,
  looksLikeCardCharge,
  norm,
  round2,
  toDate,
  toNumber,
} from './shared';

/**
 * דוח תנועות בעו"ש (יצוא מאתר הבנק — הקובץ נקרא `FibiSave*.xls`, בדיוק כמו
 * דוח האשראי).
 *
 * מבנה שנמדד על הקובץ האמיתי:
 * - ⚠️ הגיליון נקרא `Activities` — **אותו שם בדיוק כמו בדוח האשראי**. זיהוי
 *   הפורמט חייב להיות לפי תוכן, ולעולם לא לפי שם הקובץ או שם הגיליון.
 * - עמודה A ריקה; הכותרות בשורה החמישית:
 *   `תאריך | סוג פעולה | תיאור | אסמכתא | זכות | חובה | תאריך ערך | יתרה`
 * - התאריכים הם סריאלים של אקסל, לא תאי Date.
 *
 * 🪤 מלכודות שנמדדו וההגנה עליהן:
 * 1. **הכיוון נקבע מהעמודה בלבד.** `מופ"ת חובה` היא המשכורת, ו-`חובה מפרעה
 *    מוגן` היא זכות. זיהוי לפי הטקסט הופך תשע שורות.
 * 2. תא ריק בעמודת `זכות` הוא לפעמים `" "` (רווח) ולא `null`. `toNumber`
 *    מחזיר NaN לשניהם, ולכן בודקים `Number.isFinite` ולא `!== null`.
 * 3. סכום יכול להישמר כמחרוזת (`".82"` לצד `3.63` שהוא number) —
 *    `typeof === 'number'` היה מדלג עליו בשקט.
 * 4. `יתרה` מופיעה פעם אחת ליום, ולכן היתרה העדכנית היא של השורה העליונה
 *    ולא של השורה האחרונה בקובץ.
 * 5. `אסמכתא` אינה מזהה ייחודי אלא קוד סוג פעולה — 30 שורות, 10 ערכים. דדופ
 *    לפיה היה מוחק עשרים תנועות אמיתיות, ולכן היא לא נשמרת בכלל.
 */
export function parseBank(rows: Matrix): ParseResult {
  const headerRow = findRow(
    rows,
    (cells) => cells.includes('זכות') && cells.includes('חובה') && cells.includes('תאריך'),
  );
  if (headerRow < 0) throw new ImportError('לא נמצאה שורת הכותרות של דוח העו"ש');

  const cols = headerIndex(rows[headerRow]);
  const at = (name: string) => cols.get(name) ?? -1;
  const cDate = at('תאריך');
  const cDesc = at('תיאור');
  const cCredit = at('זכות');
  const cDebit = at('חובה');
  const cBalance = at('יתרה');

  if (cDesc < 0) throw new ImportError('חסרה עמודת התיאור בדוח העו"ש');

  const out: ParsedRow[] = [];
  /** יתרה מוצהרת לכל יום, בסדר שבו היא הופיעה בקובץ (החדש ביותר ראשון) */
  const days = new Map<string, { declared: number | null; credit: number; debit: number }>();

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const date = toDate(row[cDate]);
    if (!date) continue;

    const credit = toNumber(row[cCredit]);
    const debit = toNumber(row[cDebit]);
    const isCredit = Number.isFinite(credit) && credit !== 0;
    const isDebit = Number.isFinite(debit) && debit !== 0;
    if (!isCredit && !isDebit) continue;

    const amount = Math.abs(isCredit ? credit : debit);
    const description = norm(row[cDesc]) || 'ללא תיאור';
    // רק חיוב מרוכז בצד ההוצאה מסוכן לכפילות — הסכום שלו מפורט בדוח האשראי
    const isCardCharge = isDebit && looksLikeCardCharge(description);

    out.push({
      date,
      description,
      detail: null,
      amount,
      kind: isCredit ? 'income' : 'expense',
      isCardCharge,
    });

    let day = days.get(date);
    if (!day) {
      day = { declared: null, credit: 0, debit: 0 };
      days.set(date, day);
    }
    const balance = toNumber(row[cBalance]);
    if (day.declared === null && Number.isFinite(balance)) day.declared = round2(balance);
    if (isCredit) day.credit = round2(day.credit + amount);
    else day.debit = round2(day.debit + amount);
  }

  if (!out.length) throw new ImportError('לא נמצאו תנועות בקובץ');

  const income = round2(out.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0));
  const expense = round2(out.filter((r) => r.kind !== 'income').reduce((s, r) => s + r.amount, 0));

  const notes: string[] = [];

  const declaredBalances = [...days.values()].filter((d) => d.declared !== null);
  const current = declaredBalances.length ? (declaredBalances[0].declared as number) : null;
  if (current !== null) {
    notes.push(
      `היתרה העדכנית בחשבון היא ${current.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪ — לפי השורה העליונה בקובץ. היתרה עצמה אינה מיובאת, רק התנועות.`,
    );
  }

  notes.push(
    `בקובץ ${out.length} תנועות: ${income.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪ הכנסות ו-${expense.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪ הוצאות.`,
  );

  const reconciled = reconcile(days);
  if (reconciled.days > 1) {
    notes.push(
      reconciled.bad === 0
        ? `יתרות הימים בקובץ מסתדרות בדיוק עם התנועות (${reconciled.days} ימים נבדקו) — הקריאה אומתה מול הקובץ עצמו.`
        : `⚠️ ב-${reconciled.bad} מתוך ${reconciled.days} הימים היתרה בקובץ אינה מסתדרת עם התנועות. כדאי לעבור על השורות לפני הייבוא.`,
    );
  }

  const cardCharges = out.filter((r) => r.isCardCharge).length;
  if (cardCharges) {
    notes.push(
      `${cardCharges === 1 ? 'שורה אחת היא' : `${cardCharges} שורות הן`} חיוב מרוכז של כרטיס אשראי. ${cardCharges === 1 ? 'היא לא סומנה' : 'הן לא סומנו'} לייבוא, כי הסכום מפורט בדוח האשראי עצמו — סימון ${cardCharges === 1 ? 'שלה' : 'שלהן'} יספור את אותו כסף פעמיים.`,
    );
  }

  return {
    source: 'תנועות בחשבון עו"ש',
    statementKind: 'bank_statement',
    rows: out,
    // בדוח עו"ש אין שורת סה"כ להשוות אליה; האימות הוא התאמת היתרות שלמעלה
    statedTotal: null,
    parsedTotal: round2(income - expense),
    notes,
    // «חשבון: 363-313550 תאריך:31/07/2026 18:00»
    accountRef: extractAccountRef(rows),
    chargeDate: null,
    statementDate: extractHeaderDate(rows, ['תאריך']),
  };
}

/**
 * הקובץ מאמת את עצמו: `יתרה[יום] = יתרה[יום קודם] + Σזכות − Σחובה`.
 * פרסר שגוי — כיוון הפוך, סכום שנקרא כמחרוזת, שורה שנבלעה — נתפס כאן מיד,
 * בלי שום מקור חיצוני.
 */
function reconcile(days: Map<string, { declared: number | null; credit: number; debit: number }>): {
  days: number;
  bad: number;
} {
  // הקובץ יורד מהחדש לישן; מאמתים מהישן לחדש
  const ordered = [...days.values()].filter((d) => d.declared !== null).reverse();
  let bad = 0;
  for (let i = 1; i < ordered.length; i++) {
    const expected = round2((ordered[i - 1].declared as number) + ordered[i].credit - ordered[i].debit);
    if (Math.abs(expected - (ordered[i].declared as number)) > 0.005) bad++;
  }
  return { days: ordered.length, bad };
}
