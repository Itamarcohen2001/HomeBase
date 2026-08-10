// רשימת המוסדות הנתמכים ע"י israeli-bank-scrapers, לתצוגה במסך "חיבור בנקים".
// ⚠️ יש לשמור בסנכרון ידני מול bank-sync/lib/institutions.js — שני פרויקטי
// Node נפרדים (זה Expo/TS, שם CommonJS), אי אפשר לייבא ישירות בין השניים.
export type InstitutionId =
  | 'hapoalim'
  | 'otsarHahayal'
  | 'leumi'
  | 'discount'
  | 'mercantile'
  | 'mizrahi'
  | 'visaCal'
  | 'max'
  | 'isracard'
  | 'amex'
  | 'beinleumi'
  | 'massad'
  | 'yahav'
  | 'beyahadBishvilha';

export const INSTITUTIONS: { id: InstitutionId; label: string }[] = [
  { id: 'hapoalim', label: 'בנק הפועלים' },
  { id: 'otsarHahayal', label: 'בנק אוצר החייל' },
  { id: 'leumi', label: 'בנק לאומי' },
  { id: 'discount', label: 'בנק דיסקונט' },
  { id: 'mercantile', label: 'בנק מרכנתיל דיסקונט' },
  { id: 'mizrahi', label: 'בנק מזרחי טפחות' },
  { id: 'visaCal', label: 'ויזה כאל' },
  { id: 'max', label: 'מקס (לאומי קארד)' },
  { id: 'isracard', label: 'ישראכרט' },
  { id: 'amex', label: 'אמריקן אקספרס' },
  { id: 'beinleumi', label: 'הבנק הבינלאומי' },
  { id: 'massad', label: 'בנק מסד' },
  { id: 'yahav', label: 'בנק יהב' },
  { id: 'beyahadBishvilha', label: 'ביחד בשבילך' },
];

export function institutionLabel(id: string): string {
  return INSTITUTIONS.find((i) => i.id === id)?.label ?? id;
}
