/**
 * החלטה 20 — **פירוט גובר על אגרגט**.
 *
 * 🔴 שורת «4003 - כרטיסי אשראי לי» בסך 992.80 בדוח העו"ש **היא אותו כסף**
 *    כמו 26 השורות המפורטות בדוח האשראי. אם שתיהן נספרות, ההוצאה מנופחת
 *    פי שניים.
 *
 * 🔴 **וההפך מסוכן לא פחות.** מדדתי על הקובץ האמיתי: חמש שורות חיוב מרוכז
 *    בסך **9,955.55 ₪** אינן מסומנות לייבוא **לעולם** (`draft.ts` מסיר
 *    אותן על סמך המבנה בלבד). משתמש שמייבא רק את דוח העו"ש מאבד את כל
 *    הסכום הזה בשקט, והיתרה הנעקבת סוטה כלפי מעלה לצמיתות.
 *
 * ⇒ ולכן הכלל אינו «אף פעם» אלא **מותנה**: שורת אגרגט נדחית רק כאשר
 *   קיימת אצוות אשראי שמפרטת **בדיוק אותה**.
 *
 * 🎯 **מפתח ההתאמה הוא (כרטיס, סכום) ולעולם לא כרטיס לבדו.** נמדד: הכרטיס
 *    `4003` מופיע חמש פעמים באותו דוח עו"ש
 *    (992.80 · 4,538.60 · 2,634.21 · 644.58 · 1,145.36). התאמה על הכרטיס
 *    בלבד הייתה מבטלת ארבע שורות אמיתיות.
 *
 * ⚠️ הקובץ הזה **אינו** נוגע ב-`draft.ts`: שם נקבעת ברירת מחדל תחבירית,
 *    וכאן מוחל הכלל הסמנטי שדורש מצב מה-DB.
 */
import { cardRefFromCharge } from './shared';
import { toAgorot } from './draft';

/** אצוות אשראי קיימת, כפי שהיא נשמרה ב-`import_batches`. */
export interface CreditBatchRef {
  id: string;
  external_ref: string | null;
  parsed_total_agorot: number;
}

/** מה שהכלל צריך לדעת על שורה. תואם `DraftRow` בלי לתלות בו. */
export interface AggregateCandidate {
  description: string;
  amount: number;
  isCardCharge?: boolean;
  /** 🔴 שורה שכבר קיימת אצל המשתמש — ייבוא חוזר של אותו דוח */
  duplicate?: boolean;
  isRefund?: boolean;
}

export interface AggregateMatch {
  /** האצווה שמפרטת את השורה, אם קיימת */
  batchId: string | null;
  cardRef: string | null;
}

/**
 * מוצא את אצוות האשראי שמפרטת שורת חיוב מרוכז.
 *
 * מחזיר `batchId: null` כשאין התאמה — ואז השורה היא הוצאה לגיטימית
 * שחייבת להיספר.
 */
export function matchAggregate(
  row: AggregateCandidate,
  batches: CreditBatchRef[],
): AggregateMatch {
  if (!row.isCardCharge) return { batchId: null, cardRef: null };
  const cardRef = cardRefFromCharge(row.description);
  if (!cardRef) return { batchId: null, cardRef: null };

  const agorot = toAgorot(row.amount);
  // 🔴 שני התנאים יחד. ראו ההסבר על חמשת המופעים של 4003.
  const hit = batches.find(
    (b) => b.external_ref === cardRef && Number(b.parsed_total_agorot) === agorot,
  );
  return { batchId: hit ? hit.id : null, cardRef };
}

/**
 * מחיל את הכלל על טיוטה שכבר נבנתה.
 *
 * 🎯 שורת אגרגט **בלי** פירוט תואם מסומנת לייבוא — זה התיקון ל-9,955.55 ₪
 *    שנעלמו. שורה **עם** פירוט נשארת כבויה.
 *
 * ⚠️ שורות שאינן חיוב מרוכז אינן נגעות כלל, כדי שהכלל לא יבטל את
 *    ההחלטות של `draft.ts` על כפילויות וזיכויים.
 */
export function applyAggregateRule<T extends AggregateCandidate & { selected: boolean }>(
  rows: T[],
  batches: CreditBatchRef[],
): { rows: T[]; superseded: number; restored: number } {
  let superseded = 0;
  let restored = 0;
  const out = rows.map((row) => {
    if (!row.isCardCharge) return row;
    const { batchId } = matchAggregate(row, batches);
    if (batchId) {
      superseded += 1;
      return row.selected ? { ...row, selected: false } : row;
    }
    // 🔴 **הכלל הזה גובר רק על ההחרגה של `isCardCharge`, ולא על השאר.**
    //    מדדתי שבלי התנאי הזה ייבוא חוזר של אותו דוח עו"ש היה מסמן את
    //    שורת ה-992.80 שוב — היא `duplicate`, אבל היא גם `isCardCharge`,
    //    והכלל היה «משחזר» אותה ומכפיל את הכסף. בדיוק הכפילות שהוא נועד
    //    למנוע, מהכיוון השני.
    if (row.duplicate || row.isRefund) return row;
    restored += 1;
    return row.selected ? row : { ...row, selected: true };
  });
  return { rows: out, superseded, restored };
}

/**
 * הסבר בעברית לשורת חיוב מרוכז, לפי מה שנמצא.
 *
 * 🔴 המשתמש **חייב** לדעת למה שורה בסכום גדול כבויה — אחרת הוא יסמן אותה
 *    ידנית ויכפיל את הכסף, או יראה חוסר ולא יבין מניין.
 *
 * ⚠️ `linkageAvailable=false` ⇒ טבלת האצוות אינה קיימת (0012 טרם הורצה).
 *    אז **אסור להבטיח ביטול אוטומטי**: אין אצווה להיתלות בה, ומשתמש שיסמוך
 *    על ההבטחה ויביא גם את דוח האשראי יספור את אותו כסף פעמיים. הבטחה
 *    שהסכימה אינה יכולה לקיים היא בדיוק הכשל השקט, רק בעברית.
 */
export function aggregateNote(matched: boolean, linkageAvailable = true): string {
  if (matched) {
    return 'חיוב מרוכז של כרטיס אשראי שכבר יובא במפורט מדוח האשראי. הוא אינו מסומן כדי לא לספור את אותו כסף פעמיים.';
  }
  if (!linkageAvailable) {
    return 'חיוב מרוכז של כרטיס אשראי, ולכן הוא נספר כהוצאה. שימו לב: אם תייבאו גם את דוח האשראי המפורט, אותו כסף עלול להיספר פעמיים — כדאי לייבא רק אחד מהשניים.';
  }
  return 'חיוב מרוכז של כרטיס אשראי שאין לו דוח אשראי מיובא, ולכן הוא נספר כהוצאה. אם תייבאו את דוח האשראי המפורט, השורה הזו תבוטל אוטומטית.';
}
