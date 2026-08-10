import { ImportError, type ParseResult } from './shared';
import { supabase } from '../supabase';

/**
 * 🔴 **הפענוח עצמו קורה בשרת, לא כאן.** גרסה קודמת קראה ל-Gemini ישירות
 *    מהדפדפן עם מפתח שהוגדר EXPO_PUBLIC_GEMINI_API_KEY — אבל כל EXPO_PUBLIC_*
 *    נארז לתוך באנדל ה-JS הציבורי, כלומר כל מבקר באתר יכול לשלוף את המפתח
 *    מ-DevTools ולהשתמש בו על חשבון ה-Google Cloud של המשתמש (חיוב אמיתי,
 *    לא רק דליפת מידע). כאן רק בונים base64 (לא סוד) ושולחים ל-Edge Function
 *    `pdf-import`, שמחזיקה את המפתח האמיתי ב-Deno.env בלבד. ראו שם לפריסה.
 */
export async function parsePDFWithGemini(data: ArrayBuffer | Uint8Array, fileName: string): Promise<ParseResult> {
  // Uint8Array → base64. לולאת תווים ולא spread: מערך גדול דרך
  // String.fromCharCode(...bytes) יכול לזרוק "Maximum call stack size
  // exceeded" בקבצים גדולים — טווח תווים בכל פעם נמנע מזה.
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64String = btoa(binary);

  const { data: result, error } = await supabase.functions.invoke('pdf-import', {
    body: { base64: base64String, fileName },
  });
  if (error) {
    throw new ImportError('שגיאה בתקשורת עם שרת ה-AI. יש לוודא שיש חיבור לאינטרנט ושהפונקציה פרוסה.');
  }
  if (result?.error) {
    throw new ImportError(result.detail ? `${result.error} (${result.detail})` : result.error);
  }
  if (!result?.rows || !Array.isArray(result.rows)) {
    throw new ImportError('ה-AI לא מצא תנועות במסמך.');
  }

  return result as ParseResult;
}
