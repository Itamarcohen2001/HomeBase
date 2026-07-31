import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { monthStart } from '../lib/format';

const MONTH_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * מנרמל ליום הראשון בחודש. תקציבים נשמרים לפי ה-1, וכתובת שהוקלדה עם יום אחר
 * הייתה מציגה תנועות בלי היעדים — בשקט, בלי שגיאה.
 */
function normalize(value: unknown): string | null {
  return typeof value === 'string' && MONTH_PARAM.test(value)
    ? `${value.slice(0, 7)}-01`
    : null;
}

/**
 * החודש האחרון שנבחר, משותף לכל המסכים.
 *
 * מעבר בין טאבים ב-expo-router לא נושא את ה-query string: לחיצה על "ניתוח"
 * מתוך `/history?month=2026-06-01` מגיעה ל-`/analysis` חשוף (נמדד). לכן הכתובת
 * לבדה אינה מספיקה, והחודש נשמר גם כאן. בלי זה משתמש שמייבא דוח של יוני,
 * נוחת ביוני ולוחץ "ניתוח" — מקבל את החודש הנוכחי וריק.
 */
let lastMonth: string | null = null;

/**
 * החודש הנצפה במסך, כשהכתובת היא מקור האמת בתוך המסך (רענון על
 * `?month=2026-06-01` נשאר ביוני) והחודש המשותף מיישר בין הטאבים.
 */
export function useMonthParam(): [string, (next: string) => void] {
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const fromUrl = normalize(params.month);

  const [month, setLocal] = useState(() => fromUrl ?? lastMonth ?? monthStart());
  const monthRef = useRef(month);
  monthRef.current = month;

  // הערך הראשוני נרשם פעם אחת, כדי שטאב שנטען ראשון יגדיר את החודש המשותף
  useEffect(() => {
    lastMonth = monthRef.current;
  }, []);

  // הכתובת השתנתה — קישור ישיר או ניווט מהייבוא
  useEffect(() => {
    if (fromUrl && fromUrl !== monthRef.current) {
      lastMonth = fromUrl;
      setLocal(fromUrl);
    }
  }, [fromUrl]);

  // המסך חזר למוקד — מיישרים לחודש שנבחר לאחרונה, גם אם נבחר בטאב אחר
  useFocusEffect(
    useCallback(() => {
      const next = lastMonth ?? monthStart();
      if (next !== monthRef.current) {
        setLocal(next);
        router.setParams({ month: next });
      }
    }, [router]),
  );

  const setMonth = useCallback(
    (next: string) => {
      lastMonth = next;
      setLocal(next);
      router.setParams({ month: next });
    },
    [router],
  );

  return [month, setMonth];
}
