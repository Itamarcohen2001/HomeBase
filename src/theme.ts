export const colors = {
  primary: '#2E9E6B',
  primaryDark: '#238055',
  primarySoft: '#E9F6EF',
  bg: '#F7F9F8',
  surface: '#FFFFFF',
  text: '#12211B',
  textMuted: '#6B7A73',
  textFaint: '#9AA8A1',
  border: '#E8EDEA',
  danger: '#D8534F',
  dangerSoft: '#FCECEB',
  warning: '#E39B2E',
  income: '#2E9E6B',
  expense: '#D8534F',
  white: '#FFFFFF',
};

/**
 * סקאלת מרווחים אחת לכל האפליקציה. אין להמציא ערכים אקראיים —
 * כל padding/margin/gap צריך לבוא מכאן.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/** מידות קבועות של שכבות צפות (סרגל תחתון, כפתור צף) */
export const layout = {
  /** גובה סרגל הניווט התחתון, לפני תוספת ה-safe area.
   *  חייב להכיל אייקון (28) + תווית (16) + ריפודים, אחרת ה-flex מכווץ את
   *  התווית והאותיות נחתכות. */
  tabBarHeight: 68,
  /** גובה הכפתור הצף "הוספת הוצאה" */
  fabHeight: 54,
  /** המרחק של הכפתור הצף מתחתית אזור התוכן */
  fabBottom: 20,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#0F2D22',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#0F2D22',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const font = {
  h1: { fontSize: 30, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '500' as const, color: colors.text },
  small: { fontSize: 13, fontWeight: '500' as const, color: colors.textMuted },
  tiny: { fontSize: 11, fontWeight: '600' as const, color: colors.textFaint },
};

/**
 * סגנון בסיס לכל טקסט בעברית — יישור לימין וכיוון RTL.
 * (react-native-web ממפה writingDirection ל-CSS direction)
 */
export const rtlText = { textAlign: 'right' as const, writingDirection: 'rtl' as const };

/**
 * שורה בכיוון ימין→שמאל.
 * כיוון הבסיס של המסמך הוא LTR (ראה app/+html.tsx ו-I18nManager.allowRTL(false)),
 * ולכן row-reverse מציב את הילד הראשון בצד ימין — בדיוק כמו בנייטיב.
 */
export const rtlRow = { flexDirection: 'row-reverse' as const, alignItems: 'center' as const };

/**
 * שורה RTL עם רווח קבוע בין הפריטים. עדיף על marginRight/marginLeft ידניים,
 * שהם מקור חוזר לאייקונים שנדבקים לטקסט.
 */
export const rtlRowGap = (gap: number = spacing.sm) => ({ ...rtlRow, gap });

