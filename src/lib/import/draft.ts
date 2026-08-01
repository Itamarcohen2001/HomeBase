import type { Category, Kind, Transaction } from '../types';
import { type ParsedRow, normKey, round2, rowKind } from './shared';
import { guessCategoryName, isPersonalTransfer } from './merchants';

export type ImportRule = { pattern: string; category_id: string };

export type DraftRow = ParsedRow & {
  /** מזהה יציב לשורה במסך האישור */
  id: string;
  /** האם לייבא */
  selected: boolean;
  /** הכיוון שנגזר לשורה — כאן הוא כבר מוכרע ולא אופציונלי */
  kind: Kind;
  categoryId: string | null;
  /** מאיפה הגיעה הקטגוריה — משפיע על האם ללמוד כלל חדש */
  categorySource: 'rule' | 'dictionary' | 'user' | 'none';
  /** כבר קיימת תנועה זהה במסד */
  duplicate: boolean;
  /**
   * ייתכן שהשורה כבר נרשמה על ידי כלל חוזר. ⚠️ תגית בלבד — השורה נשארת
   * מסומנת. `apply_recurring` כותב את **כותרת הכלל** כהערה ואת יום החיוב
   * כתאריך, ולכן חתימת הכפילות המדויקת לעולם לא תתפוס חפיפה כזאת.
   */
  recurringOverlap: boolean;
  /**
   * כותרת הכלל החוזר שהשורה עשויה לחפוף לו. ההיוריסטיקה עצמה לא משתנה —
   * זו הצגה בלבד, שנותנת למשתמש את מה שדרוש כדי להכריע בעצמו כשאותו סכום
   * מופיע פעמיים באותו יום.
   */
  recurringNote: string | null;
  /**
   * למי נזקפת ההוצאה. `null` = משותפת לכל משק הבית (ברירת המחדל בייבוא —
   * מדוח אשראי אי אפשר לדעת מי מבני הבית ביצע את העסקה). אחרת `user_id`
   * של בן משק הבית שהשורה נזקפת לו.
   */
  assignedTo: string | null;
};

/**
 * חתימת כפילות: תאריך + סכום + תיאור מנורמל.
 * ⚠️ **סופרים מופעים ולא עושים distinct.** בקובץ אמיתי של כ.א.ל יש שתי שורות
 * זהות לחלוטין (`2026-06-04 PAYBOX 40`) והן שתי עסקאות אמיתיות. לכן שורה
 * מסומנת ככפילות רק אם כבר יש במסד לפחות אותו מספר מופעים.
 */
export function signature(date: string, amountAgorot: number, description: string): string {
  return `${date}|${amountAgorot}|${normKey(baseDescription(description))}`;
}

/** מפריד בין שם בית העסק לפירוט שנוסף אחריו, כדי שהחתימה תישאר יציבה. */
export const NOTE_SEPARATOR = ' · ';

export function baseDescription(note: string): string {
  const i = note.indexOf(NOTE_SEPARATOR);
  return i < 0 ? note : note.slice(0, i);
}

/** פירוט שאינו מוסיף מידע (מזהה Apple Pay מופיע כמעט בכל שורה). */
function usefulDetail(detail: string | null | undefined): string | null {
  const text = (detail ?? '').trim();
  if (!text) return null;
  if (/מזהה כרטיס/.test(text)) return null;
  return text;
}

/** ההערה שתישמר על התנועה: שם בית העסק, ואחריו פירוט רק אם הוא מוסיף מידע. */
export function noteFor(row: Pick<ParsedRow, 'description' | 'detail'>): string {
  const detail = usefulDetail(row.detail);
  return detail ? `${row.description}${NOTE_SEPARATOR}${detail}` : row.description;
}

export function toAgorot(amount: number): number {
  return Math.round(round2(amount) * 100);
}

function existingCounts(existing: Transaction[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tx of existing) {
    const key = signature(tx.occurred_on, tx.amount_agorot, tx.note ?? '');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * חודש + סכום של תנועות שנוצרו מכלל חוזר, ולצידם כותרת הכלל להצגה.
 *
 * ההיוריסטיקה רחבה בכוונה — בלי התאמת תיאור, בלי חלון תאריכים ובלי ניקוד
 * דמיון. המשתמש ביקש במפורש להעדיף תיוג-יתר על פני החמצה, ומכיוון שהתגית
 * לעולם לא מבטלת סימון, המחיר של חיובי-שגוי הוא מבט אחד. בקובץ האמיתי יש
 * `העברת שכר דירה 4,600` ו-`העברה מהחשבון 4,600` **באותו יום** — אין שום
 * אות שתפריד ביניהן, ולכן גם לא מנסים להפריד.
 *
 * 💡 מה שכן אפשר: `apply_recurring` כותב `note := r.title`, ולכן הכותרת
 * זמינה בלי לשלוף את `recurring_rules`. מציגים אותה, והמשתמש מכריע לבד
 * איזו משתי השורות היא הכפילות — בלי שהקוד ינחש במקומו.
 */
function recurringMatches(existing: Transaction[]): Map<string, string> {
  const byKey = new Map<string, Set<string>>();
  for (const tx of existing) {
    if (!tx.recurring_rule_id) continue;
    const key = `${tx.occurred_on.slice(0, 7)}|${tx.amount_agorot}`;
    const titles = byKey.get(key) ?? new Set<string>();
    const title = baseDescription(tx.note ?? '').trim();
    if (title) titles.add(title);
    byKey.set(key, titles);
  }
  return new Map([...byKey].map(([key, titles]) => [key, [...titles].join(NOTE_SEPARATOR)]));
}

/**
 * התאמת קטגוריה: קודם כלל שהמשתמש לימד, אחר כך המילון המובנה.
 * ⚠️ הכיוון מגיע מהשורה. קטגוריה מהכיוון ההפוך לעולם לא מותאמת — גם לא דרך
 * כלל נלמד, אחרת שורת `זכות` שמכילה תבנית שנלמדה מהוצאה תקבל קטגוריית הוצאה.
 */
function matchCategory(
  description: string,
  categories: Category[],
  rules: ImportRule[],
  kind: Kind,
): { id: string | null; source: DraftRow['categorySource'] } {
  const key = normKey(description);
  const sameKind = new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));

  // כללים נלמדים — התבנית הארוכה ביותר שמתאימה מנצחת
  const hit = rules
    .filter((r) => r.pattern && key.includes(r.pattern) && sameKind.has(r.category_id))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (hit) return { id: hit.category_id, source: 'rule' };

  const name = guessCategoryName(description, kind);
  if (name) {
    const match = categories.find((c) => c.kind === kind && normKey(c.name) === normKey(name));
    if (match) return { id: match.id, source: 'dictionary' };
  }
  return { id: null, source: 'none' };
}

export function buildDraft(
  rows: ParsedRow[],
  opts: { categories: Category[]; existing: Transaction[]; rules: ImportRule[] },
): DraftRow[] {
  const counts = existingCounts(opts.existing);
  const recurring = recurringMatches(opts.existing);
  const seen = new Map<string, number>();

  // מיון לפי תאריך כדי שמסך האישור ייקרא כמו דוח — חלק מהקבצים לא ממוינים
  const ordered = rows.map((row, i) => ({ row, i })).sort((a, b) => a.row.date.localeCompare(b.row.date) || a.i - b.i);

  return ordered.map(({ row, i }) => {
    const agorot = toAgorot(row.amount);
    const kind = rowKind(row);
    const key = signature(row.date, agorot, row.description);
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    // השורה ה-n בקובץ נחשבת כפילות רק אם כבר קיימים במסד לפחות n+1 מופעים
    const duplicate = (counts.get(key) ?? 0) > index;

    const { id, source } = matchCategory(row.description, opts.categories, opts.rules, kind);
    const recurringNote = recurring.get(`${row.date.slice(0, 7)}|${agorot}`) ?? null;
    return {
      ...row,
      id: `${i}-${key}`,
      kind,
      // זיכוי לא מיובא כברירת מחדל — אי אפשר לרשום הוצאה שלילית
      selected: !duplicate && !row.isCardCharge && !row.isRefund,
      categoryId: id,
      categorySource: source,
      duplicate,
      // כפילות מדויקת כבר מספרת את הסיפור במלואו — אין טעם בשתי תגיות
      recurringOverlap: !duplicate && recurringNote !== null,
      recurringNote: duplicate ? null : recurringNote || null,
      assignedTo: null,
    };
  });
}

/** כללים חדשים ללמידה: רק שורות שהמשתמש שינה בהן קטגוריה בעצמו. */
export function rulesToLearn(rows: DraftRow[], existing: ImportRule[]): ImportRule[] {
  const known = new Set(existing.map((r) => r.pattern));
  const out = new Map<string, string>();
  for (const row of rows) {
    if (row.categorySource !== 'user' || !row.categoryId) continue;
    if (isPersonalTransfer(row.description)) continue;
    const pattern = normKey(row.description);
    if (!pattern || known.has(pattern)) continue;
    out.set(pattern, row.categoryId);
  }
  return [...out].map(([pattern, category_id]) => ({ pattern, category_id }));
}
