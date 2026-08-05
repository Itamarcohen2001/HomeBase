export const lightColors = {
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

export const darkColors: typeof lightColors = {
  primary: '#2E9E6B', // Keep primary brand color
  primaryDark: '#45C085', // Brighter for better contrast on dark
  primarySoft: '#1B402D', // Very dark green tint for backgrounds
  bg: '#0F1412', // Very dark greenish-grey for main background
  surface: '#1C2622', // Slightly lighter for cards
  text: '#F5F5F5',
  textMuted: '#B8C7C0',
  textFaint: '#8FA19A',
  border: '#3A4A43',
  danger: '#EF6864',
  dangerSoft: '#5E2C2A',
  warning: '#F5B047',
  income: '#36BA7D',
  expense: '#EF6864',
  white: '#FFFFFF', // Keep white for things that need to stay white
};

export const colors = lightColors;

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
  h1: { fontSize: 30, fontWeight: '800' as const, color: lightColors.text },
  h2: { fontSize: 24, fontWeight: '700' as const, color: lightColors.text },
  h3: { fontSize: 20, fontWeight: '600' as const, color: lightColors.text },
  body: { fontSize: 16, fontWeight: '400' as const, color: lightColors.text },
  small: { fontSize: 14, fontWeight: '400' as const, color: lightColors.textMuted },
  bold: { fontSize: 16, fontWeight: '600' as const, color: lightColors.text },
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

