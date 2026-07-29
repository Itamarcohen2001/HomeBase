import type { AnalysisSlice, Transaction } from './types';

/**
 * פלטה מתגלגלת לגרף הפיצול בין בני הבית.
 * משק בית יכול להיות בכל גודל — לא מניחים שניים — ולכן הצבעים נבחרים
 * במודולו על אורך הפלטה, ובגדלים גדולים הם פשוט חוזרים בסדר קבוע.
 */
export const PALETTE = [
  '#2E9E6B',
  '#4F7FE4',
  '#E4894F',
  '#9B6BDF',
  '#C2557A',
  '#5BC0BE',
  '#E3B02E',
  '#6B8E7B',
  '#D8534F',
  '#3C8DBC',
];

/** צבע פרוסת "משותף" — אפור-כחלחל שלא מתחרה בצבעי האנשים */
export const SHARED_COLOR = '#8A94A6';

export const SHARED_LABEL = 'משותף';

export function paletteColor(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/**
 * ממיר סכומים לאחוזים שלמים שסכומם בדיוק 100 (שיטת השארית הגדולה).
 * עיגול נאיבי מייצר "99%" או "101%" ברשימה, וזה נראה כמו באג.
 */
function toPercents(amounts: number[]): number[] {
  const total = amounts.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return amounts.map(() => 0);

  const exact = amounts.map((v) => (v / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = 100 - floors.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const out = [...floors];
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) out[order[k].i] += 1;
  return out;
}

type Bucket = { key: string; label: string; amount: number; color?: string; icon?: string };

function finalize(buckets: Bucket[]): AnalysisSlice[] {
  const kept = buckets.filter((b) => b.amount > 0).sort((a, b) => b.amount - a.amount);
  const percents = toPercents(kept.map((b) => b.amount));
  const used = new Set<string>();

  return kept.map((b, i) => {
    // שתי קטגוריות יכולות לשאת את אותו צבע (הזרעה מגיעה עם כפילויות),
    // ואז שתי פרוסות שכנות נראות כמו פרוסה אחת. במקרה כזה נופלים לפלטה.
    let color = b.color ?? paletteColor(i);
    if (used.has(color)) {
      for (let k = 0; k < PALETTE.length; k++) {
        const candidate = paletteColor(i + k);
        if (!used.has(candidate)) {
          color = candidate;
          break;
        }
      }
    }
    used.add(color);
    return { key: b.key, label: b.label, amount: b.amount, percent: percents[i], color, icon: b.icon };
  });
}

/** פיצול הוצאות החודש לפי קטגוריה. הוצאות משותפות נכללות כרגיל. */
export function splitByCategory(transactions: Transaction[]): AnalysisSlice[] {
  const buckets = new Map<string, Bucket>();

  for (const t of transactions) {
    if (t.kind !== 'expense') continue;
    const key = t.category_id ?? 'uncategorized';
    const existing = buckets.get(key);
    if (existing) {
      existing.amount += t.amount_agorot;
      continue;
    }
    buckets.set(key, {
      key,
      label: t.categories?.name ?? 'ללא קטגוריה',
      amount: t.amount_agorot,
      color: t.categories?.color,
      icon: t.categories?.icon,
    });
  }

  return finalize([...buckets.values()]);
}

/**
 * פיצול הוצאות החודש לפי אדם, עם פרוסה נפרדת ל"משותף".
 * דינמי לכל מספר בני בית — אין הנחה של שניים.
 */
export function splitByPerson(transactions: Transaction[]): AnalysisSlice[] {
  const people = new Map<string, Bucket>();
  let shared = 0;

  for (const t of transactions) {
    if (t.kind !== 'expense') continue;
    if (t.is_shared) {
      shared += t.amount_agorot;
      continue;
    }
    const key = t.user_id ?? 'unknown';
    const existing = people.get(key);
    if (existing) {
      existing.amount += t.amount_agorot;
      continue;
    }
    people.set(key, {
      key,
      label: t.profiles?.full_name ?? t.profiles?.email ?? 'לא ידוע',
      amount: t.amount_agorot,
    });
  }

  const buckets = [...people.values()];
  // "משותף" תמיד אחרון בסדר הצבעים כדי שהוא לא "יגנוב" צבע של אדם
  buckets.forEach((b, i) => {
    b.color = paletteColor(i);
  });
  if (shared > 0) buckets.push({ key: 'shared', label: SHARED_LABEL, amount: shared, color: SHARED_COLOR });

  return finalize(buckets);
}

export function totalOf(slices: AnalysisSlice[]): number {
  return slices.reduce((sum, s) => sum + s.amount, 0);
}
