import { Platform, Share } from 'react-native';

export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * משתף טקסט דרך תפריט השיתוף של המכשיר, ואם אין כזה — מעתיק ללוח.
 *
 * ב-react-native-web `Share.share` נשען על `navigator.share`, שקיים רק
 * בדפדפני מובייל ורק בהקשר מאובטח. בדסקטופ הוא זורק, ולכן חייב fallback
 * ללוח — אחרת הכפתור פשוט לא עושה כלום.
 */
export async function shareOrCopy(text: string, title?: string): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;

    if (nav?.share) {
      try {
        await nav.share({ title, text });
        return 'shared';
      } catch (e) {
        // המשתמש ביטל את תפריט השיתוף — לא נפילה, ולא מעתיקים במקום
        if (e instanceof Error && e.name === 'AbortError') return 'shared';
      }
    }

    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(text);
        return 'copied';
      } catch {
        // ממשיכים ל-fallback הישן
      }
    }

    return legacyCopy(text) ? 'copied' : 'failed';
  }

  try {
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** העתקה בדפדפנים בלי Clipboard API (או בהקשר לא מאובטח) */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** כתובת הבסיס של האפליקציה, לשיבוץ בהודעת ההזמנה */
export function appOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'https://itamarco2001-homebase.expo.app';
}
