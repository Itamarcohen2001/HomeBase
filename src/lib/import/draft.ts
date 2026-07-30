import type { Category, Transaction } from '../types';
import { IMPORT_KIND, type ParsedRow, normKey, round2 } from './shared';
import { guessCategoryName, isPersonalTransfer } from './merchants';

export type ImportRule = { pattern: string; category_id: string };

export type DraftRow = ParsedRow & {
  /** מזהה יציב לשורה במסך האישור */
  id: string;
  /** האם לייבא */
  selected: boolean;
  categoryId: string | null;
  /** מאיפה הגיעה הקטגוריה — משפיע על האם ללמוד כלל חדש */
  categorySource: 'rule' | 'dictionary' | 'user' | 'none';
  /** כבר קיימת תנועה זהה במסד */
  duplicate: boolean;
  shared: boolean;
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

/** התאמת קטגוריה: קודם כלל שהמשתמש לימד, אחר כך המילון המובנה. */
function matchCategory(
  description: string,
  categories: Category[],
  rules: ImportRule[],
): { id: string | null; source: DraftRow['categorySource'] } {
  const key = normKey(description);
  const valid = new Set(categories.map((c) => c.id));

  // כללים נלמדים — התבנית הארוכה ביותר שמתאימה מנצחת
  const hit = rules
    .filter((r) => r.pattern && key.includes(r.pattern) && valid.has(r.category_id))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (hit) return { id: hit.category_id, source: 'rule' };

  const name = guessCategoryName(description);
  if (name) {
    const match = categories.find((c) => c.kind === IMPORT_KIND && normKey(c.name) === normKey(name));
    if (match) return { id: match.id, source: 'dictionary' };
  }
  return { id: null, source: 'none' };
}

export function buildDraft(
  rows: ParsedRow[],
  opts: { categories: Category[]; existing: Transaction[]; rules: ImportRule[] },
): DraftRow[] {
  const counts = existingCounts(opts.existing);
  const seen = new Map<string, number>();

  // מיון לפי תאריך כדי שמסך האישור ייקרא כמו דוח — חלק מהקבצים לא ממוינים
  const ordered = rows.map((row, i) => ({ row, i })).sort((a, b) => a.row.date.localeCompare(b.row.date) || a.i - b.i);

  return ordered.map(({ row, i }) => {
    const agorot = toAgorot(row.amount);
    const key = signature(row.date, agorot, row.description);
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    // השורה ה-n בקובץ נחשבת כפילות רק אם כבר קיימים במסד לפחות n+1 מופעים
    const duplicate = (counts.get(key) ?? 0) > index;

    const { id, source } = matchCategory(row.description, opts.categories, opts.rules);
    return {
      ...row,
      id: `${i}-${key}`,
      // זיכוי לא מיובא כברירת מחדל — אי אפשר לרשום הוצאה שלילית
      selected: !duplicate && !row.isCardCharge && !row.isRefund,
      categoryId: id,
      categorySource: source,
      duplicate,
      shared: false,
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
