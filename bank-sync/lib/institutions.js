// מיפוי companyId (כפי ש-israeli-bank-scrapers מצפה) → שדות ההתחברות
// הנדרשים. מקור: README של israeli-bank-scrapers (עשוי להשתנות בין גרסאות —
// אם ההתחברות נכשלת עם שגיאה על שדה חסר/לא מזוהה, לבדוק שם קודם).
module.exports = {
  hapoalim: { label: 'בנק הפועלים', fields: ['userCode', 'password'] },
  otsarHahayal: { label: 'בנק אוצר החייל', fields: ['username', 'password'] },
  leumi: { label: 'בנק לאומי', fields: ['username', 'password'] },
  discount: { label: 'בנק דיסקונט', fields: ['id', 'password', 'num'] },
  mercantile: { label: 'בנק מרכנתיל דיסקונט', fields: ['id', 'password', 'num'] },
  mizrahi: { label: 'בנק מזרחי טפחות', fields: ['username', 'password'] },
  visaCal: { label: 'ויזה כאל', fields: ['username', 'password'] },
  max: { label: 'מקס (לאומי קארד)', fields: ['username', 'password'] },
  isracard: { label: 'ישראכרט', fields: ['id', 'card6Digits', 'password'] },
  amex: { label: 'אמריקן אקספרס', fields: ['username', 'card6Digits', 'password'] },
  beinleumi: { label: 'הבנק הבינלאומי', fields: ['username', 'password'] },
  massad: { label: 'בנק מסד', fields: ['username', 'password'] },
  yahav: { label: 'בנק יהב', fields: ['username', 'password', 'nationalID'] },
  beyahadBishvilha: { label: 'ביחד בשבילך', fields: ['id', 'password'] },
};

// תוויות עברית לשדות — נגזרות לפי שם השדה, לא לפי מוסד.
module.exports.FIELD_LABELS = {
  userCode: 'קוד משתמש',
  username: 'שם משתמש',
  password: 'סיסמה',
  id: 'תעודת זהות',
  num: 'מספר חשבון',
  card6Digits: '6 הספרות האחרונות של הכרטיס',
  nationalID: 'תעודת זהות',
};
