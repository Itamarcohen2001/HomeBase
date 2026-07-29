/**
 * תרגום שגיאות של Supabase Auth לעברית.
 *
 * Supabase מחזיר הודעות באנגלית בלבד. בלי המיפוי הזה מחרוזות כמו
 * `Email address "x@y.com" is invalid` הגיעו ישירות למסך בממשק עברי.
 *
 * סדר הבדיקה: קוד השגיאה (`AuthError.code`) → התאמת טקסט (לשגיאות ישנות
 * שמגיעות בלי קוד) → ברירת מחדל גנרית בעברית. שום מחרוזת אנגלית לא
 * אמורה להגיע למשתמש.
 */

type MaybeAuthError = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  error_description?: unknown;
};

const GENERIC = 'משהו השתבש. נסה שוב בעוד רגע.';

/** קודי שגיאה רשמיים של Supabase Auth */
const BY_CODE: Record<string, string> = {
  email_address_invalid: 'כתובת המייל אינה תקינה',
  email_address_not_authorized: 'לא ניתן לשלוח מייל לכתובת הזו',
  invalid_credentials: 'כתובת מייל או סיסמה שגויים',
  email_not_confirmed: 'המייל עדיין לא אומת — בדוק את תיבת הדואר',
  user_already_exists: 'כבר קיים משתמש עם כתובת המייל הזו',
  email_exists: 'כבר קיים משתמש עם כתובת המייל הזו',
  phone_exists: 'כבר קיים משתמש עם מספר הטלפון הזה',
  weak_password: 'הסיסמה חלשה מדי — בחר סיסמה ארוכה יותר (לפחות 6 תווים)',
  over_email_send_rate_limit: 'שלחנו כבר כמה מיילים — נסה שוב בעוד כמה דקות',
  over_request_rate_limit: 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.',
  over_sms_send_rate_limit: 'יותר מדי הודעות נשלחו. נסה שוב מאוחר יותר.',
  user_not_found: 'לא נמצא משתמש עם הפרטים האלה',
  user_banned: 'החשבון הזה חסום',
  session_expired: 'החיבור פג. יש להתחבר מחדש.',
  session_not_found: 'החיבור פג. יש להתחבר מחדש.',
  refresh_token_not_found: 'החיבור פג. יש להתחבר מחדש.',
  refresh_token_already_used: 'החיבור פג. יש להתחבר מחדש.',
  no_authorization: 'החיבור פג. יש להתחבר מחדש.',
  bad_jwt: 'החיבור פג. יש להתחבר מחדש.',
  otp_expired: 'הקוד או הקישור פגו. בקש חדש.',
  same_password: 'הסיסמה החדשה זהה לקודמת',
  signup_disabled: 'ההרשמה סגורה כרגע',
  email_provider_disabled: 'הרשמה עם מייל אינה מופעלת',
  provider_disabled: 'שיטת ההתחברות הזו אינה מופעלת',
  validation_failed: 'חלק מהפרטים שהוזנו אינם תקינים',
  captcha_failed: 'אימות האבטחה נכשל. נסה שוב.',
  request_timeout: 'הבקשה ארכה יותר מדי. בדוק את החיבור ונסה שוב.',
};

/** התאמת טקסט — לשגיאות שמגיעות בלי code (גרסאות ישנות / שגיאות רשת) */
const BY_TEXT: [RegExp, string][] = [
  [/invalid login credentials/i, 'כתובת מייל או סיסמה שגויים'],
  [/email not confirmed/i, 'המייל עדיין לא אומת — בדוק את תיבת הדואר'],
  [/user already registered/i, 'כבר קיים משתמש עם כתובת המייל הזו'],
  [/password should be at least/i, 'הסיסמה חייבת להכיל לפחות 6 תווים'],
  [/(unable to validate email|is invalid|invalid email)/i, 'כתובת המייל אינה תקינה'],
  [/provider is not enabled/i, 'שיטת ההתחברות הזו אינה מופעלת בפרויקט'],
  [/for security purposes|rate limit|too many requests/i, 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.'],
  [/(failed to fetch|network|networkerror|err_failed)/i, 'אין חיבור לאינטרנט. בדוק את הרשת ונסה שוב.'],
  [/timeout|timed out/i, 'הבקשה ארכה יותר מדי. בדוק את החיבור ונסה שוב.'],
];

/** האם המחרוזת נראית כמו טקסט שמתאים להצגה למשתמש ישראלי (כלומר בעברית) */
function isHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * מקבל כל שגיאה (AuthError, Error, מחרוזת) ומחזיר טקסט בעברית.
 * הודעות שכבר בעברית מוחזרות כמו שהן — כך אפשר לזרוק שגיאות מקומיות.
 */
export function translateAuthError(err: unknown): string {
  if (err == null) return GENERIC;

  if (typeof err === 'string') {
    return isHebrew(err) ? err : matchText(err) ?? GENERIC;
  }

  const e = err as MaybeAuthError;

  const code = typeof e.code === 'string' ? e.code : undefined;
  if (code && BY_CODE[code]) return BY_CODE[code];

  const message =
    typeof e.message === 'string'
      ? e.message
      : typeof e.error_description === 'string'
        ? e.error_description
        : '';

  // שגיאות שאנחנו עצמנו זרקנו כבר בעברית
  if (message && isHebrew(message)) return message;

  const byText = matchText(message);
  if (byText) return byText;

  if (e.status === 429) return 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.';
  if (typeof e.status === 'number' && e.status >= 500) {
    return 'השרת לא זמין כרגע. נסה שוב בעוד רגע.';
  }

  return GENERIC;
}

function matchText(message: string): string | null {
  for (const [re, he] of BY_TEXT) {
    if (re.test(message)) return he;
  }
  return null;
}

/**
 * גרסה לשגיאות כלליות (לא Auth) — נופלת לטקסט ברירת מחדל שנבחר לפי ההקשר.
 * משמשת מסכים שמדברים מול הדאטהבייס.
 */
export function errorText(err: unknown, fallback: string): string {
  if (err == null) return fallback;
  const message = typeof err === 'string' ? err : ((err as MaybeAuthError).message as string) ?? '';
  if (message && isHebrew(message)) return message;
  const byText = matchText(message);
  if (byText) return byText;
  return fallback;
}
